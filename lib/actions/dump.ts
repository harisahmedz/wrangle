"use server";

import { refresh } from "next/cache";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "@/db";
import {
  activities,
  boards,
  cards,
  columns,
  expenseCategories,
  expenses,
  learningItems,
  learningSessions,
  memberships,
  projects,
  users,
} from "@/db/schema";
import { requireUser } from "@/lib/authz";
import { localDateParts } from "@/lib/dates";
import { dumpSaveSchema } from "@/lib/validation/dump";
import { failure, type ActionResult } from "@/lib/actions/types";

export async function listLearningTopicsForDump(): Promise<
  ActionResult<{ id: string; title: string }[]>
> {
  const userId = await requireUser();
  const rows = await db
    .select({ id: learningItems.id, title: learningItems.title })
    .from(learningItems)
    .where(
      and(
        eq(learningItems.userId, userId),
        isNull(learningItems.deletedAt),
      ),
    )
    .orderBy(asc(learningItems.position))
    .limit(200);
  return { ok: true, data: rows };
}

export async function listExpenseCategoriesForDump(): Promise<
  ActionResult<{ id: string; name: string }[]>
> {
  const userId = await requireUser();
  const rows = await db
    .select({ id: expenseCategories.id, name: expenseCategories.name })
    .from(expenseCategories)
    .where(
      and(
        eq(expenseCategories.userId, userId),
        eq(expenseCategories.isArchived, false),
      ),
    )
    .orderBy(asc(expenseCategories.position))
    .limit(100);
  return { ok: true, data: rows };
}

function resolveCategory(
  categoryId: string | undefined,
  cats: { id: string; name: string }[],
): { id: string; name: string } | null {
  if (categoryId) {
    const chosen = cats.find((c) => c.id === categoryId);
    if (chosen) return chosen;
  }
  const other = cats.find((c) => c.name.toLowerCase() === "other");
  return other ?? cats[0] ?? null;
}

export async function saveDump(
  items: unknown,
): Promise<ActionResult<{ saved: number; summary: string }>> {
  const parsed = dumpSaveSchema.safeParse(items);
  if (!parsed.success) {
    return failure("Some rows are incomplete — fix them and save again");
  }
  const userId = await requireUser();

  const [user] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const tz = user?.timezone || "UTC";
  const { y, m, d } = localDateParts(new Date(), tz);
  const todayKey = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const [personal] = await db
    .select({ projectId: projects.id })
    .from(memberships)
    .innerJoin(projects, eq(memberships.projectId, projects.id))
    .where(
      and(
        eq(memberships.userId, userId),
        eq(projects.isPersonal, true),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);
  if (!personal) return failure("My Space not found — try reloading");

  const boardRows = await db
    .select({ id: boards.id, kind: boards.kind })
    .from(boards)
    .where(
      and(
        eq(boards.projectId, personal.projectId),
        inArray(boards.kind, ["todo", "ideas"]),
      ),
    );
  const todoBoardId = boardRows.find((b) => b.kind === "todo")?.id;
  const ideasBoardId = boardRows.find((b) => b.kind === "ideas")?.id;
  if (!todoBoardId || !ideasBoardId) return failure("My Space boards are missing");

  const columnRows = await db
    .select({
      id: columns.id,
      boardId: columns.boardId,
      position: columns.position,
    })
    .from(columns)
    .where(
      and(
        inArray(columns.boardId, [todoBoardId, ideasBoardId]),
        isNull(columns.deletedAt),
      ),
    )
    .orderBy(asc(columns.position));
  const todoColumnId = columnRows.find((c) => c.boardId === todoBoardId)?.id;
  const ideasColumnId = columnRows.find((c) => c.boardId === ideasBoardId)?.id;
  if (!todoColumnId || !ideasColumnId) return failure("No columns to add into");

  const lastPos = new Map<string, string | null>();
  for (const colId of [todoColumnId, ideasColumnId]) {
    const [last] = await db
      .select({ position: cards.position })
      .from(cards)
      .where(and(eq(cards.columnId, colId), isNull(cards.deletedAt)))
      .orderBy(desc(cards.position))
      .limit(1);
    lastPos.set(colId, last?.position ?? null);
  }

  const hasExpenseRows = parsed.data.some((i) => i.kind === "expense");
  const cats = hasExpenseRows
    ? await db
        .select({ id: expenseCategories.id, name: expenseCategories.name })
        .from(expenseCategories)
        .where(
          and(
            eq(expenseCategories.userId, userId),
            eq(expenseCategories.isArchived, false),
          ),
        )
        .orderBy(asc(expenseCategories.position))
    : [];
  if (hasExpenseRows && cats.length === 0) {
    return failure("No expense categories set up yet");
  }

  const learnCandidates = await db
    .select({ id: learningItems.id, title: learningItems.title })
    .from(learningItems)
    .where(
      and(eq(learningItems.userId, userId), isNull(learningItems.deletedAt)),
    );

  const counts = { task: 0, idea: 0, expense: 0, learning: 0 };

  try {
    await db.transaction(async (tx) => {
      for (const item of parsed.data) {
        if (item.kind === "task" || item.kind === "idea") {
          const colId = item.kind === "task" ? todoColumnId : ideasColumnId;
          const boardId = item.kind === "task" ? todoBoardId : ideasBoardId;
          const position = generateKeyBetween(lastPos.get(colId) ?? null, null);
          lastPos.set(colId, position);
          const [card] = await tx
            .insert(cards)
            .values({
              columnId: colId,
              boardId,
              projectId: personal.projectId,
              title: item.title,
              position,
              dueAt:
                item.kind === "task" && item.dueAtIso
                  ? new Date(item.dueAtIso)
                  : null,
              isAllDay: item.kind === "task" ? item.isAllDay : false,
              createdBy: userId,
            })
            .returning({ id: cards.id });
          await tx.insert(activities).values({
            projectId: personal.projectId,
            actorId: userId,
            entityType: "card",
            entityId: card.id,
            verb: "created",
            meta: { via: "dump" },
          });
          counts[item.kind] += 1;
        } else if (item.kind === "expense") {
          const category = resolveCategory(item.categoryId, cats);
          if (!category) throw new Error("expense-category-missing");
          await tx.insert(expenses).values({
            userId,
            categoryId: category.id,
            amountMinor: item.amountMinor,
            currency: "USD",
            spentOn: item.spentOn,
            note: item.note || null,
          });
          counts.expense += 1;
        } else {
          let itemId: string | null = null;
          if (item.learningItemId) {
            const owned = learnCandidates.find(
              (c) => c.id === item.learningItemId,
            );
            if (owned) itemId = owned.id;
          }
          if (!itemId) {
            const topicLower = item.topic.toLowerCase();
            const exact = learnCandidates.find(
              (c) => c.title.toLowerCase() === topicLower,
            );
            const partial = exact
              ? null
              : learnCandidates.find((c) =>
                  c.title.toLowerCase().includes(topicLower),
                );
            const matched = exact ?? partial;
            if (matched) itemId = matched.id;
          }
          if (!itemId) {
            const [created] = await tx
              .insert(learningItems)
              .values({ userId, title: item.topic, status: "learning" })
              .returning({ id: learningItems.id });
            itemId = created.id;
            learnCandidates.push({ id: created.id, title: item.topic });
          }
          await tx.insert(learningSessions).values({
            itemId,
            happenedOn: todayKey,
            minutes: item.minutes,
            note: null,
          });
          const [agg] = await tx
            .select({
              minutes: sql<number>`coalesce(sum(${learningSessions.minutes}), 0)::int`,
            })
            .from(learningSessions)
            .where(eq(learningSessions.itemId, itemId));
          await tx
            .update(learningItems)
            .set({
              hoursLogged: String(Math.round(((agg?.minutes ?? 0) / 60) * 100) / 100),
            })
            .where(eq(learningItems.id, itemId));
          counts.learning += 1;
        }
      }
    });
  } catch {
    return failure("Could not save your dump — try again");
  }

  const saved = parsed.data.length;
  const bits: string[] = [];
  const ordered = [
    { count: counts.expense, label: "expense" },
    { count: counts.idea, label: "idea" },
    { count: counts.task, label: "task" },
    { count: counts.learning, label: "learning session" },
  ];
  for (const entry of ordered) {
    if (entry.count > 0) {
      bits.push(`${entry.count} ${entry.label}${entry.count === 1 ? "" : "s"}`);
    }
  }
  const summary =
    bits.length > 0 ? `Filed ${saved} — ${bits.join(" · ")}` : `Filed ${saved}`;

  refresh();
  return { ok: true, data: { saved, summary } };
}
