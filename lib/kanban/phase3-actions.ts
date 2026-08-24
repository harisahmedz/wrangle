"use server";

import { refresh } from "next/cache";
import { and, asc, eq, isNull } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "@/db";
import {
  activities,
  boards,
  cards,
  columns,
  memberships,
  projects,
} from "@/db/schema";
import { requireMembership, requireUser } from "@/lib/authz";
import { cardIdSchema } from "@/lib/validation/kanban";
import { failure, type ActionResult } from "@/lib/actions/types";

const clampLevel = (n: number) => Math.max(1, Math.min(5, Math.round(n)));

export async function updateCardScore(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = cardIdSchema.safeParse({ cardId: formData.get("cardId") });
  if (!parsed.success) return failure("Invalid card");

  const impactRaw = formData.get("impact");
  const effortRaw = formData.get("effort");
  const impact =
    impactRaw === null || impactRaw === "" ? null : clampLevel(Number(impactRaw));
  const effort =
    effortRaw === null || effortRaw === "" ? null : clampLevel(Number(effortRaw));

  const [ctx] = await db
    .select({ projectId: cards.projectId })
    .from(cards)
    .where(and(eq(cards.id, parsed.data.cardId), isNull(cards.deletedAt)))
    .limit(1);
  if (!ctx) return failure("Card not found");
  await requireMembership(ctx.projectId, "member");

  await db
    .update(cards)
    .set({ impact, effort })
    .where(eq(cards.id, parsed.data.cardId));

  refresh();
  return { ok: true };
}

export async function promoteIdea(
  formData: FormData,
): Promise<
  ActionResult<{ previousColumnId: string; previousPosition: string }>
> {
  const parsed = cardIdSchema.safeParse({ cardId: formData.get("cardId") });
  if (!parsed.success) return failure("Invalid card");

  const [card] = await db
    .select({
      projectId: cards.projectId,
      columnId: cards.columnId,
      position: cards.position,
      completedAt: cards.completedAt,
    })
    .from(cards)
    .where(and(eq(cards.id, parsed.data.cardId), isNull(cards.deletedAt)))
    .limit(1);
  if (!card) return failure("Card not found");
  const { userId } = await requireMembership(card.projectId, "member");

  const [todoBoard] = await db
    .select({ id: boards.id })
    .from(boards)
    .where(
      and(eq(boards.projectId, card.projectId), eq(boards.kind, "todo")),
    )
    .limit(1);
  if (!todoBoard) return failure("To-Do board missing");

  const [firstColumn] = await db
    .select({ id: columns.id })
    .from(columns)
    .where(and(eq(columns.boardId, todoBoard.id), isNull(columns.deletedAt)))
    .orderBy(asc(columns.position))
    .limit(1);
  if (!firstColumn) return failure("No columns on To-Do board");

  const [last] = await db
    .select({ position: cards.position })
    .from(cards)
    .where(and(eq(cards.columnId, firstColumn.id), isNull(cards.deletedAt)))
    .orderBy(asc(cards.position))
    .limit(1);

  await db
    .update(cards)
    .set({
      boardId: todoBoard.id,
      columnId: firstColumn.id,
      position: generateKeyBetween(last?.position ?? null, null),
    })
    .where(eq(cards.id, parsed.data.cardId));

  await db.insert(activities).values({
    projectId: card.projectId,
    actorId: userId,
    entityType: "card",
    entityId: parsed.data.cardId,
    verb: "promoted",
  });

  refresh();
  return {
    ok: true,
    data: {
      previousColumnId: card.columnId,
      previousPosition: card.position,
    },
  };
}

export async function quickAddCard(
  formData: FormData,
): Promise<ActionResult<{ title: string }>> {
  const userId = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  if (!title || title.length > 300) return failure("Give it a title (≤300 chars)");

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

  const [todoBoard] = await db
    .select({ id: boards.id })
    .from(boards)
    .where(
      and(eq(boards.projectId, personal.projectId), eq(boards.kind, "todo")),
    )
    .limit(1);
  if (!todoBoard) return failure("My Space has no To-Do board");

  const [firstColumn] = await db
    .select({ id: columns.id })
    .from(columns)
    .where(and(eq(columns.boardId, todoBoard.id), isNull(columns.deletedAt)))
    .orderBy(asc(columns.position))
    .limit(1);
  if (!firstColumn) return failure("No columns to add into");

  const [last] = await db
    .select({ position: cards.position })
    .from(cards)
    .where(and(eq(cards.columnId, firstColumn.id), isNull(cards.deletedAt)))
    .orderBy(asc(cards.position))
    .limit(1);

  await db.insert(cards).values({
    columnId: firstColumn.id,
    boardId: todoBoard.id,
    projectId: personal.projectId,
    title,
    position: generateKeyBetween(last?.position ?? null, null),
    createdBy: userId,
  });

  await db.insert(activities).values({
    projectId: personal.projectId,
    actorId: userId,
    entityType: "card",
    entityId: personal.projectId,
    verb: "created",
    meta: { via: "quick-add", title },
  });

  refresh();
  return { ok: true, data: { title } };
}
