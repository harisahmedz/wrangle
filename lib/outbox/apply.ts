// The server side of every queued mutation kind (docs/OFFLINE-OUTBOX.md
// §1, §5, §6). One function per kind, called by `POST /api/outbox` after
// `auth()` — this module does its own membership/ownership checks per entry
// with the non-redirecting `membershipRole`, so one bad entry fails alone
// instead of aborting the batch.
//
// A plain module, never "use server": its exports take a trusted `userId`.
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "@/db";
import {
  boards,
  cardFocuses,
  cards,
  checklistItems,
  columns,
  expenseCategories,
  expenses,
  learningItems,
  users,
} from "@/db/schema";
import { hasMinRole, membershipRole } from "@/lib/authz";
import { cardContext, columnContext, logActivity } from "@/lib/kanban/context";
import { insertCard, resolveFreePosition } from "@/lib/kanban/insert-card";
import { normalizePriority } from "@/lib/kanban/priority";
import type { Mutation, WireEntry } from "@/lib/outbox/types";

export type ApplyResult =
  | { status: "applied"; patch?: { position?: string } }
  | { status: "dropped"; reason: string }
  | { status: "failed"; reason: string };

const APPLIED: ApplyResult = { status: "applied" };
const NO_ACCESS = "You no longer have access to this project";

const dropped = (reason: string): ApplyResult => ({ status: "dropped", reason });
const failed = (reason: string): ApplyResult => ({ status: "failed", reason });
const deletedElsewhere = (title: string | null, noun: string) =>
  dropped(title ? `“${title}” was deleted on another device` : `That ${noun} was deleted`);

async function canEdit(userId: string, projectId: string): Promise<boolean> {
  const role = await membershipRole(userId, projectId);
  return role !== null && hasMinRole(role, "member");
}

export async function applyMutation(userId: string, entry: WireEntry): Promise<ApplyResult> {
  const m = entry.mutation;
  switch (m.kind) {
    case "card.create":
      return applyCardCreate(userId, m);
    case "card.update":
      return applyCardUpdate(userId, m);
    case "card.complete":
      return applyCardComplete(userId, m, entry.createdAt);
    case "card.move":
      return applyCardMove(userId, m);
    case "checklist.set":
      return applyChecklistSet(userId, m);
    case "learning.setStatus":
      return applyLearningSetStatus(userId, m);
    case "expense.create":
      return applyExpenseCreate(userId, m);
    default:
      return failed("Unknown change");
  }
}

async function firstLiveColumn(boardId: string) {
  const [col] = await db
    .select({ id: columns.id })
    .from(columns)
    .where(and(eq(columns.boardId, boardId), isNull(columns.deletedAt)))
    .orderBy(asc(columns.position))
    .limit(1);
  return col ?? null;
}

async function applyCardCreate(
  userId: string,
  m: Extract<Mutation, { kind: "card.create" }>,
): Promise<ApplyResult> {
  let columnId: string;
  let boardId: string;
  let projectId: string;
  let position = m.position;
  let via: string | undefined;

  if ("columnId" in m.target) {
    const col = await columnContext(m.target.columnId);
    if (!col) return failed("Column not found");
    if (!(await canEdit(userId, col.projectId))) return failed(NO_ACCESS);
    boardId = col.boardId;
    projectId = col.projectId;
    if (col.deletedAt) {
      // §5.2: a created card is the user's work — fall back to the board's
      // first live column at the end rather than losing it.
      const fallback = await firstLiveColumn(col.boardId);
      if (!fallback) return failed("No columns to add into");
      columnId = fallback.id;
      position = undefined;
    } else {
      columnId = m.target.columnId;
    }
  } else {
    if (!(await canEdit(userId, m.target.projectId))) return failed(NO_ACCESS);
    const [board] = await db
      .select({ id: boards.id })
      .from(boards)
      .where(and(eq(boards.projectId, m.target.projectId), eq(boards.kind, m.target.boardKind)))
      .limit(1);
    if (!board) return failed("Board not found");
    const first = await firstLiveColumn(board.id);
    if (!first) return failed("No columns to add into");
    columnId = first.id;
    boardId = board.id;
    projectId = m.target.projectId;
    via = "quick-add";
  }

  const card = await insertCard({
    id: m.id,
    columnId,
    boardId,
    projectId,
    title: m.title,
    userId,
    position,
    dueAt: m.dueAt ? new Date(m.dueAt) : null,
    isAllDay: m.isAllDay,
    priority: m.priority,
  });
  if (!card) return failed("Could not create card");

  await logActivity(projectId, userId, "card", card.cardId, "created", {
    title: m.title,
    ...(via ? { via } : {}),
  });
  return card.position === m.position ? APPLIED : { status: "applied", patch: { position: card.position } };
}

async function applyCardUpdate(
  userId: string,
  m: Extract<Mutation, { kind: "card.update" }>,
): Promise<ApplyResult> {
  const ctx = await cardContext(m.cardId);
  if (!ctx) return dropped("That card was deleted");
  // Membership before anything that echoes the row (its title) back.
  if (!(await canEdit(userId, ctx.projectId))) return failed(NO_ACCESS);
  if (ctx.deletedAt) return deletedElsewhere(ctx.title, "card");

  // §5.2 patch-wins-per-field: only the fields the user changed are set.
  const set: Partial<typeof cards.$inferInsert> = {};
  if (m.patch.title !== undefined) set.title = m.patch.title;
  if (m.patch.description !== undefined) set.description = m.patch.description || null;
  if (m.patch.dueAt !== undefined) set.dueAt = m.patch.dueAt ? new Date(m.patch.dueAt) : null;
  if (m.patch.isAllDay !== undefined) set.isAllDay = m.patch.isAllDay;
  if (m.patch.priority !== undefined) set.priority = normalizePriority(m.patch.priority);
  if (Object.keys(set).length === 0) return APPLIED;

  await db.update(cards).set(set).where(eq(cards.id, m.cardId));
  return APPLIED;
}

async function applyCardComplete(
  userId: string,
  m: Extract<Mutation, { kind: "card.complete" }>,
  createdAt: number,
): Promise<ApplyResult> {
  const ctx = await cardContext(m.cardId);
  if (!ctx) return dropped("That card was deleted");
  if (!(await canEdit(userId, ctx.projectId))) return failed(NO_ACCESS);
  if (ctx.deletedAt) return deletedElsewhere(ctx.title, "card");

  if (m.completed === (ctx.completedAt !== null)) return APPLIED;

  // §5.3: done when the user ticked it, not when it synced — clamped to
  // [card.createdAt, now] so a device clock can't backdate it before the
  // card existed (or into the future).
  const completedAt = m.completed
    ? new Date(Math.max(ctx.createdAt.getTime(), Math.min(createdAt, Date.now())))
    : null;
  await db.transaction(async (tx) => {
    await tx
      .update(cards)
      .set({ completedAt, completedBy: m.completed ? userId : null })
      .where(eq(cards.id, m.cardId));
    if (m.completed) {
      await tx.delete(cardFocuses).where(eq(cardFocuses.cardId, m.cardId));
    }
  });
  await logActivity(ctx.projectId, userId, "card", m.cardId, m.completed ? "completed" : "reopened");
  return APPLIED;
}

async function applyCardMove(
  userId: string,
  m: Extract<Mutation, { kind: "card.move" }>,
): Promise<ApplyResult> {
  const ctx = await cardContext(m.cardId);
  if (!ctx) return dropped("That card was deleted");
  if (!(await canEdit(userId, ctx.projectId))) return failed(NO_ACCESS);
  if (ctx.deletedAt) return deletedElsewhere(ctx.title, "card");

  const target = await columnContext(m.toColumnId);
  if (
    !target ||
    target.deletedAt ||
    target.projectId !== ctx.projectId ||
    target.boardId !== ctx.boardId
  ) {
    return dropped("Column was removed; card left where it was");
  }

  if (ctx.columnId === m.toColumnId && ctx.position === m.position) return APPLIED;

  const wasCompleted = ctx.completedAt !== null;
  const nowCompleted = target.isDone;

  const position = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`cards:${m.toColumnId}`}::text))`,
    );
    const free = await resolveFreePosition(tx, m.toColumnId, m.position, m.cardId);
    await tx
      .update(cards)
      .set({
        columnId: m.toColumnId,
        position: free,
        completedAt: nowCompleted ? (ctx.completedAt ?? new Date()) : null,
        completedBy: nowCompleted ? (ctx.completedBy ?? userId) : null,
      })
      .where(eq(cards.id, m.cardId));
    if (!wasCompleted && nowCompleted) {
      await tx.delete(cardFocuses).where(eq(cardFocuses.cardId, m.cardId));
    }
    return free;
  });

  await logActivity(ctx.projectId, userId, "card", m.cardId, "moved", {
    to_column_id: m.toColumnId,
    to_done: nowCompleted,
  });
  if (!wasCompleted && nowCompleted) {
    await logActivity(ctx.projectId, userId, "card", m.cardId, "completed");
  }
  if (wasCompleted && !nowCompleted) {
    await logActivity(ctx.projectId, userId, "card", m.cardId, "reopened");
  }
  return position === m.position ? APPLIED : { status: "applied", patch: { position } };
}

async function applyChecklistSet(
  userId: string,
  m: Extract<Mutation, { kind: "checklist.set" }>,
): Promise<ApplyResult> {
  const [item] = await db
    .select({ isDone: checklistItems.isDone, text: checklistItems.text, cardId: checklistItems.cardId })
    .from(checklistItems)
    .where(and(eq(checklistItems.id, m.itemId), isNull(checklistItems.deletedAt)))
    .limit(1);
  if (!item) return dropped("That checklist item was deleted");
  const card = await cardContext(item.cardId);
  if (!card) return dropped("That card was deleted");
  if (!(await canEdit(userId, card.projectId))) return failed(NO_ACCESS);
  if (card.deletedAt) return deletedElsewhere(card.title, "card");

  if (item.isDone === m.isDone) return APPLIED;
  await db.update(checklistItems).set({ isDone: m.isDone }).where(eq(checklistItems.id, m.itemId));
  return APPLIED;
}

async function applyLearningSetStatus(
  userId: string,
  m: Extract<Mutation, { kind: "learning.setStatus" }>,
): Promise<ApplyResult> {
  const [item] = await db
    .select({ status: learningItems.status, completedAt: learningItems.completedAt, title: learningItems.title })
    .from(learningItems)
    .where(
      and(eq(learningItems.id, m.itemId), eq(learningItems.userId, userId), isNull(learningItems.deletedAt)),
    )
    .limit(1);
  if (!item) return dropped("That learning item was deleted");
  if (item.status === m.status) return APPLIED;

  // Append to the end of the target status under the same per-user/status
  // lock `createLearningItem` takes (`learning_items_user_status_position_uq`).
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`learning:${userId}:${m.status}`}::text))`,
    );
    const [last] = await tx
      .select({ position: learningItems.position })
      .from(learningItems)
      .where(
        and(
          eq(learningItems.userId, userId),
          eq(learningItems.status, m.status),
          isNull(learningItems.deletedAt),
        ),
      )
      .orderBy(desc(learningItems.position))
      .limit(1);
    await tx
      .update(learningItems)
      .set({
        status: m.status,
        completedAt: m.status === "learned" ? (item.completedAt ?? new Date()) : null,
        position: generateKeyBetween(last?.position ?? null, null),
      })
      .where(eq(learningItems.id, m.itemId));
  });
  return APPLIED;
}

async function applyExpenseCreate(
  userId: string,
  m: Extract<Mutation, { kind: "expense.create" }>,
): Promise<ApplyResult> {
  const [category] = await db
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(and(eq(expenseCategories.id, m.categoryId), eq(expenseCategories.userId, userId)))
    .limit(1);
  if (!category) return failed("Pick a category");

  const [user] = await db
    .select({ currency: users.currency })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const [created] = await db
    .insert(expenses)
    .values({
      id: m.id,
      userId,
      categoryId: m.categoryId,
      amountMinor: m.amountMinor,
      currency: user?.currency ?? "USD",
      spentOn: m.spentOn,
      note: m.note || null,
      paymentMethod: m.paymentMethod || null,
    })
    .onConflictDoNothing({ target: expenses.id })
    .returning({ id: expenses.id });
  if (created) return APPLIED;

  // Replay: the row already exists. Only count it as ours if it is ours.
  const [existing] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(and(eq(expenses.id, m.id), eq(expenses.userId, userId)))
    .limit(1);
  return existing ? APPLIED : failed("Could not add expense");
}
