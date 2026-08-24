"use server";

import { refresh } from "next/cache";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "@/db";
import {
  activities,
  boards,
  cards,
  columns,
} from "@/db/schema";
import { requireMembership } from "@/lib/authz";
import {
  cardIdSchema,
  createCardSchema,
  createColumnSchema,
  deleteColumnSchema,
  moveCardSchema,
  updateCardSchema,
} from "@/lib/validation/kanban";
import { failure, type ActionResult } from "@/lib/actions/types";

async function boardProjectId(boardId: string): Promise<string | null> {
  const [row] = await db
    .select({ projectId: boards.projectId })
    .from(boards)
    .where(eq(boards.id, boardId))
    .limit(1);
  return row?.projectId ?? null;
}

async function columnContext(columnId: string) {
  const [row] = await db
    .select({
      projectId: boards.projectId,
      boardId: columns.boardId,
      name: columns.name,
      isDone: columns.isDone,
    })
    .from(columns)
    .innerJoin(boards, eq(columns.boardId, boards.id))
    .where(eq(columns.id, columnId))
    .limit(1);
  return row ?? null;
}

async function cardContext(cardId: string) {
  const [row] = await db
    .select({
      projectId: cards.projectId,
      columnId: cards.columnId,
      position: cards.position,
      completedAt: cards.completedAt,
    })
    .from(cards)
    .where(eq(cards.id, cardId))
    .limit(1);
  return row ?? null;
}

async function logActivity(
  projectId: string,
  actorId: string,
  entityType: string,
  entityId: string,
  verb: string,
  meta?: Record<string, unknown>,
) {
  await db.insert(activities).values({
    projectId,
    actorId,
    entityType,
    entityId,
    verb,
    meta,
  });
}

export async function createColumn(
  formData: FormData,
): Promise<ActionResult<{ columnId: string }>> {
  const parsed = createColumnSchema.safeParse({
    boardId: formData.get("boardId"),
    name: formData.get("name"),
  });
  if (!parsed.success) return failure("Invalid column");

  const projectId = await boardProjectId(parsed.data.boardId);
  if (!projectId) return failure("Board not found");
  const { userId } = await requireMembership(projectId, "admin");

  const [last] = await db
    .select({ position: columns.position })
    .from(columns)
    .where(and(eq(columns.boardId, parsed.data.boardId), isNull(columns.deletedAt)))
    .orderBy(desc(columns.position))
    .limit(1);

  const [column] = await db
    .insert(columns)
    .values({
      boardId: parsed.data.boardId,
      name: parsed.data.name,
      position: generateKeyBetween(last?.position ?? null, null),
    })
    .returning({ id: columns.id });

  await logActivity(projectId, userId, "column", column.id, "created", {
    name: parsed.data.name,
  });
  refresh();
  return { ok: true, data: { columnId: column.id } };
}

export async function renameColumn(formData: FormData): Promise<ActionResult> {
  const columnId = String(formData.get("columnId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!columnId || !name || name.length > 60) return failure("Invalid name");
  const ctxRow = await columnContext(columnId);
  if (!ctxRow) return failure("Column not found");
  await requireMembership(ctxRow.projectId, "admin");

  await db.update(columns).set({ name }).where(eq(columns.id, columnId));
  refresh();
  return { ok: true };
}

export async function deleteColumn(formData: FormData): Promise<ActionResult> {
  const parsed = deleteColumnSchema.safeParse({
    columnId: formData.get("columnId"),
    targetColumnId: formData.get("targetColumnId") || undefined,
  });
  if (!parsed.success) return failure("Invalid column");

  const ctxRow = await columnContext(parsed.data.columnId);
  if (!ctxRow) return failure("Column not found");
  const { userId } = await requireMembership(ctxRow.projectId, "admin");

  const columnCards = await db
    .select({ id: cards.id, position: cards.position })
    .from(cards)
    .where(and(eq(cards.columnId, parsed.data.columnId), isNull(cards.deletedAt)))
    .orderBy(asc(cards.position));

  if (columnCards.length > 0) {
    if (!parsed.data.targetColumnId) {
      return failure("This column has cards — choose where to move them");
    }
    const target = await columnContext(parsed.data.targetColumnId);
    if (target?.projectId !== ctxRow.projectId) return failure("Invalid target");
    if (target.boardId !== ctxRow.boardId) return failure("Target must be on the same board");

    const [lastTarget] = await db
      .select({ position: cards.position })
      .from(cards)
      .where(and(eq(cards.columnId, parsed.data.targetColumnId), isNull(cards.deletedAt)))
      .orderBy(desc(cards.position))
      .limit(1);

    let pos = lastTarget?.position ?? null;
    for (const c of columnCards) {
      pos = generateKeyBetween(pos, null);
      await db
        .update(cards)
        .set({ columnId: parsed.data.targetColumnId, position: pos })
        .where(eq(cards.id, c.id));
    }
  }

  await db
    .update(columns)
    .set({ deletedAt: new Date() })
    .where(eq(columns.id, parsed.data.columnId));

  await logActivity(ctxRow.projectId, userId, "column", parsed.data.columnId, "deleted", {
    name: ctxRow.name,
  });
  refresh();
  return { ok: true };
}

export async function createCard(
  formData: FormData,
): Promise<ActionResult<{ cardId: string; position: string }>> {
  const parsed = createCardSchema.safeParse({
    columnId: formData.get("columnId"),
    title: formData.get("title"),
    atTop: formData.get("atTop") === "true",
  });
  if (!parsed.success) return failure("Invalid card");

  const col = await columnContext(parsed.data.columnId);
  if (!col) return failure("Column not found");
  const { userId } = await requireMembership(col.projectId, "member");

  const [first] = parsed.data.atTop
    ? await db
        .select({ position: cards.position })
        .from(cards)
        .where(and(eq(cards.columnId, parsed.data.columnId), isNull(cards.deletedAt)))
        .orderBy(asc(cards.position))
        .limit(1)
    : [];

  const [last] = !parsed.data.atTop
    ? await db
        .select({ position: cards.position })
        .from(cards)
        .where(and(eq(cards.columnId, parsed.data.columnId), isNull(cards.deletedAt)))
        .orderBy(desc(cards.position))
        .limit(1)
    : [];

  const position = parsed.data.atTop
    ? generateKeyBetween(null, first?.position ?? null)
    : generateKeyBetween(last?.position ?? null, null);

  const [card] = await db
    .insert(cards)
    .values({
      columnId: parsed.data.columnId,
      boardId: col.boardId,
      projectId: col.projectId,
      title: parsed.data.title,
      position,
      createdBy: userId,
    })
    .returning({ id: cards.id });

  await logActivity(col.projectId, userId, "card", card.id, "created", {
    title: parsed.data.title,
  });
  refresh();
  return { ok: true, data: { cardId: card.id, position } };
}

export async function updateCard(formData: FormData): Promise<ActionResult> {
  const parsed = updateCardSchema.safeParse({
    cardId: formData.get("cardId"),
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    dueAt: formData.get("dueAt") ? String(formData.get("dueAt")) : null,
    isAllDay: formData.get("isAllDay") === "true",
  });
  if (!parsed.success) return failure("Invalid card details");

  const ctx = await cardContext(parsed.data.cardId);
  if (!ctx) return failure("Card not found");
  await requireMembership(ctx.projectId, "member");

  await db
    .update(cards)
    .set({
      title: parsed.data.title,
      description: parsed.data.description || null,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
      isAllDay: parsed.data.isAllDay,
    })
    .where(eq(cards.id, parsed.data.cardId));

  refresh();
  return { ok: true };
}

export async function toggleCardComplete(
  formData: FormData,
): Promise<ActionResult<{ completed: boolean }>> {
  const parsed = cardIdSchema.safeParse({ cardId: formData.get("cardId") });
  if (!parsed.success) return failure("Invalid card");

  const ctx = await cardContext(parsed.data.cardId);
  if (!ctx) return failure("Card not found");
  const { userId } = await requireMembership(ctx.projectId, "member");

  const nowCompleted = ctx.completedAt === null;
  await db
    .update(cards)
    .set({ completedAt: nowCompleted ? new Date() : null })
    .where(eq(cards.id, parsed.data.cardId));

  await logActivity(
    ctx.projectId,
    userId,
    "card",
    parsed.data.cardId,
    nowCompleted ? "completed" : "reopened",
  );
  refresh();
  return { ok: true, data: { completed: nowCompleted } };
}

export async function moveCard(formData: FormData): Promise<ActionResult> {
  const parsed = moveCardSchema.safeParse({
    cardId: formData.get("cardId"),
    toColumnId: formData.get("toColumnId"),
    position: formData.get("position"),
  });
  if (!parsed.success) return failure("Invalid move");

  const ctx = await cardContext(parsed.data.cardId);
  if (!ctx) return failure("Card not found");
  const { userId } = await requireMembership(ctx.projectId, "member");

  const target = await columnContext(parsed.data.toColumnId);
  if (!target || target.projectId !== ctx.projectId) return failure("Invalid target column");

  if (ctx.columnId === parsed.data.toColumnId && ctx.position === parsed.data.position) {
    return { ok: true };
  }

  const wasCompleted = ctx.completedAt !== null;
  const nowCompleted = target.isDone;

  await db
    .update(cards)
    .set({
      columnId: parsed.data.toColumnId,
      position: parsed.data.position,
      completedAt: nowCompleted ? (ctx.completedAt ?? new Date()) : null,
    })
    .where(eq(cards.id, parsed.data.cardId));

  await logActivity(ctx.projectId, userId, "card", parsed.data.cardId, "moved", {
    to_column_id: parsed.data.toColumnId,
    to_done: nowCompleted,
  });

  if (!wasCompleted && nowCompleted) {
    await logActivity(
      ctx.projectId,
      userId,
      "card",
      parsed.data.cardId,
      "completed",
    );
  }
  if (wasCompleted && !nowCompleted) {
    await logActivity(
      ctx.projectId,
      userId,
      "card",
      parsed.data.cardId,
      "reopened",
    );
  }
  return { ok: true };
}

export async function archiveCard(formData: FormData): Promise<ActionResult> {
  const parsed = cardIdSchema.safeParse({ cardId: formData.get("cardId") });
  if (!parsed.success) return failure("Invalid card");

  const ctx = await cardContext(parsed.data.cardId);
  if (!ctx) return failure("Card not found");
  const { userId } = await requireMembership(ctx.projectId, "member");

  await db
    .update(cards)
    .set({ deletedAt: new Date() })
    .where(eq(cards.id, parsed.data.cardId));

  await logActivity(ctx.projectId, userId, "card", parsed.data.cardId, "archived");
  refresh();
  return { ok: true };
}

export async function restoreCard(formData: FormData): Promise<ActionResult> {
  const parsed = cardIdSchema.safeParse({ cardId: formData.get("cardId") });
  if (!parsed.success) return failure("Invalid card");

  const ctx = await cardContext(parsed.data.cardId);
  if (!ctx) return failure("Card not found");
  await requireMembership(ctx.projectId, "member");

  await db
    .update(cards)
    .set({ deletedAt: null })
    .where(eq(cards.id, parsed.data.cardId));

  refresh();
  return { ok: true };
}
