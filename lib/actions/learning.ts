"use server";

import { refresh } from "next/cache";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "@/db";
import {
  boards,
  cardLinks,
  cards,
  columns,
  learningItems,
  learningMilestones,
  learningNotes,
  learningResources,
  learningSessions,
  users,
} from "@/db/schema";
import { requireMembership, requireUser } from "@/lib/authz";
import { computeProgress } from "@/lib/learning/logic";
import {
  addMilestoneSchema,
  addNoteSchema,
  addResourceSchema,
  addSessionSchema,
  createItemSchema,
  itemIdSchema,
  linkToBoardSchema,
  milestoneIdSchema,
  noteIdSchema,
  resourceIdSchema,
  sessionIdSchema,
  setManualProgressSchema,
  setStatusSchema,
  updateItemSchema,
} from "@/lib/validation/learning";
import { failure, type ActionResult } from "@/lib/actions/types";
import { todayKey } from "@/lib/money";

async function ownItem(itemId: string) {
  const userId = await requireUser();
  const [item] = await db
    .select()
    .from(learningItems)
    .where(
      and(
        eq(learningItems.id, itemId),
        eq(learningItems.userId, userId),
        isNull(learningItems.deletedAt),
      ),
    )
    .limit(1);
  return item ?? null;
}

async function recomputeDerived(itemId: string) {
  const [agg] = await db
    .select({
      total: sql<number>`count(*)::int`,
      done: sql<number>`sum(case when ${learningMilestones.isDone} then 1 else 0 end)::int`,
    })
    .from(learningMilestones)
    .where(eq(learningMilestones.itemId, itemId));

  if (!agg || agg.total === 0) return;

  await db
    .update(learningItems)
    .set({ progressPct: computeProgress(agg.done, agg.total) })
    .where(eq(learningItems.id, itemId));
}

async function recalcHours(itemId: string) {
  const [agg] = await db
    .select({
      minutes: sql<number>`coalesce(sum(${learningSessions.minutes}), 0)::int`,
    })
    .from(learningSessions)
    .where(eq(learningSessions.itemId, itemId));

  await db
    .update(learningItems)
    .set({ hoursLogged: String(Math.round(((agg?.minutes ?? 0) / 60) * 100) / 100) })
    .where(eq(learningItems.id, itemId));
}

export async function createLearningItem(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const userId = await requireUser();

  const parsed = createItemSchema.safeParse({
    title: formData.get("title"),
    type: formData.get("type") ?? undefined,
    sourceUrl: formData.get("sourceUrl") || undefined,
    whyNote: formData.get("whyNote") || undefined,
    targetDate: formData.get("targetDate") || undefined,
  });
  if (!parsed.success) return failure("Check the fields (title required)");

  const [last] = await db
    .select({ position: learningItems.position })
    .from(learningItems)
    .where(and(eq(learningItems.userId, userId), eq(learningItems.status, "want")))
    .orderBy(asc(learningItems.position))
    .limit(1);

  const [row] = await db
    .insert(learningItems)
    .values({
      userId,
      title: parsed.data.title,
      type: parsed.data.type,
      sourceUrl: parsed.data.sourceUrl || null,
      whyNote: parsed.data.whyNote || null,
      targetDate: parsed.data.targetDate ?? null,
      position: generateKeyBetween(last?.position ?? null, null),
    })
    .returning({ id: learningItems.id });

  refresh();
  return { ok: true, data: { id: row.id } };
}

export async function updateLearningItem(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateItemSchema.safeParse({
    itemId: formData.get("itemId"),
    title: formData.get("title"),
    type: formData.get("type"),
    status: formData.get("status"),
    sourceUrl: String(formData.get("sourceUrl") ?? ""),
    whyNote: String(formData.get("whyNote") ?? ""),
    targetDate: String(formData.get("targetDate") ?? ""),
  });
  if (!parsed.success) return failure("Check the fields");

  const item = await ownItem(parsed.data.itemId);
  if (!item) return failure("Not found");

  await db
    .update(learningItems)
    .set({
      title: parsed.data.title,
      type: parsed.data.type,
      status: parsed.data.status,
      sourceUrl: parsed.data.sourceUrl || null,
      whyNote: parsed.data.whyNote || null,
      targetDate: parsed.data.targetDate || null,
      completedAt:
        parsed.data.status === "learned"
          ? (item.completedAt ?? new Date())
          : null,
    })
    .where(eq(learningItems.id, item.id));

  refresh();
  return { ok: true };
}

export async function setLearningStatus(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = setStatusSchema.safeParse({
    itemId: formData.get("itemId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return failure("Invalid status");

  const item = await ownItem(parsed.data.itemId);
  if (!item) return failure("Not found");

  await db
    .update(learningItems)
    .set({
      status: parsed.data.status,
      completedAt:
        parsed.data.status === "learned"
          ? (item.completedAt ?? new Date())
          : null,
    })
    .where(eq(learningItems.id, item.id));

  refresh();
  return { ok: true };
}

export async function deleteLearningItem(
  formData: FormData,
): Promise<ActionResult<{ title: string }>> {
  const parsed = itemIdSchema.safeParse({ itemId: formData.get("itemId") });
  if (!parsed.success) return failure("Invalid");

  const item = await ownItem(parsed.data.itemId);
  if (!item) return failure("Not found");

  await db
    .update(learningItems)
    .set({ deletedAt: new Date() })
    .where(eq(learningItems.id, item.id));

  refresh();
  return { ok: true, data: { title: item.title } };
}

export async function restoreLearningItem(
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUser();
  const parsed = itemIdSchema.safeParse({ itemId: formData.get("itemId") });
  if (!parsed.success) return failure("Invalid");

  await db
    .update(learningItems)
    .set({ deletedAt: null })
    .where(
      and(
        eq(learningItems.id, parsed.data.itemId),
        eq(learningItems.userId, userId),
      ),
    );

  refresh();
  return { ok: true };
}

export async function addSession(formData: FormData): Promise<ActionResult> {
  const userId = await requireUser();

  let happenedOn = String(formData.get("happenedOn") ?? "");
  if (!happenedOn) {
    const [user] = await db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    happenedOn = todayKey(user?.timezone || "UTC");
  }

  const parsed = addSessionSchema.safeParse({
    itemId: formData.get("itemId"),
    happenedOn,
    minutes: Number(formData.get("minutes")),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return failure("Minutes must be 1–1440");

  const item = await ownItem(parsed.data.itemId);
  if (!item) return failure("Not found");

  await db.insert(learningSessions).values(parsed.data);
  await recalcHours(item.id);
  refresh();
  return { ok: true };
}

export async function deleteSession(formData: FormData): Promise<ActionResult> {
  const parsed = sessionIdSchema.safeParse({
    sessionId: formData.get("sessionId"),
  });
  if (!parsed.success) return failure("Invalid");

  const [session] = await db
    .select({ itemId: learningSessions.itemId })
    .from(learningSessions)
    .innerJoin(learningItems, eq(learningSessions.itemId, learningItems.id))
    .where(eq(learningSessions.id, parsed.data.sessionId))
    .limit(1);

  const item = session ? await ownItem(session.itemId) : null;
  if (!item) return failure("Not found");

  await db.delete(learningSessions).where(eq(learningSessions.id, parsed.data.sessionId));
  await recalcHours(item.id);
  refresh();
  return { ok: true };
}

export async function addMilestone(formData: FormData): Promise<ActionResult> {
  const parsed = addMilestoneSchema.safeParse({
    itemId: formData.get("itemId"),
    text: formData.get("text"),
  });
  if (!parsed.success) return failure("Text required");

  const item = await ownItem(parsed.data.itemId);
  if (!item) return failure("Not found");

  const [last] = await db
    .select({ position: learningMilestones.position })
    .from(learningMilestones)
    .where(eq(learningMilestones.itemId, item.id))
    .orderBy(asc(learningMilestones.position))
    .limit(1);

  await db.insert(learningMilestones).values({
    itemId: item.id,
    text: parsed.data.text,
    position: generateKeyBetween(last?.position ?? null, null),
  });
  await recomputeDerived(item.id);
  refresh();
  return { ok: true };
}

export async function toggleMilestone(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = milestoneIdSchema.safeParse({
    milestoneId: formData.get("milestoneId"),
  });
  if (!parsed.success) return failure("Invalid");

  const [ms] = await db
    .select()
    .from(learningMilestones)
    .where(eq(learningMilestones.id, parsed.data.milestoneId))
    .limit(1);
  if (!ms) return failure("Not found");
  if (!(await ownItem(ms.itemId))) return failure("Not found");

  await db
    .update(learningMilestones)
    .set({ isDone: !ms.isDone })
    .where(eq(learningMilestones.id, ms.id));

  await recomputeDerived(ms.itemId);

  if (!ms.isDone) {
    await db
      .update(learningItems)
      .set({ status: "learning" })
      .where(and(eq(learningItems.id, ms.itemId), eq(learningItems.status, "want")));
  }

  refresh();
  return { ok: true };
}

export async function deleteMilestone(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = milestoneIdSchema.safeParse({
    milestoneId: formData.get("milestoneId"),
  });
  if (!parsed.success) return failure("Invalid");

  const [ms] = await db
    .select({ itemId: learningMilestones.itemId })
    .from(learningMilestones)
    .where(eq(learningMilestones.id, parsed.data.milestoneId))
    .limit(1);
  const item = ms ? await ownItem(ms.itemId) : null;
  if (!item) return failure("Not found");

  await db.delete(learningMilestones).where(eq(learningMilestones.id, parsed.data.milestoneId));
  await recomputeDerived(item.id);
  refresh();
  return { ok: true };
}

export async function setManualProgress(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = setManualProgressSchema.safeParse({
    itemId: formData.get("itemId"),
    progressPct: Number(formData.get("progressPct")),
  });
  if (!parsed.success) return failure("0–100 only");

  const item = await ownItem(parsed.data.itemId);
  if (!item) return failure("Not found");

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(learningMilestones)
    .where(eq(learningMilestones.itemId, item.id));

  if (count > 0) {
    return failure("Milestones drive progress — delete them to go manual");
  }

  await db
    .update(learningItems)
    .set({ progressPct: parsed.data.progressPct })
    .where(eq(learningItems.id, item.id));
  refresh();
  return { ok: true };
}

export async function addResource(formData: FormData): Promise<ActionResult> {
  const parsed = addResourceSchema.safeParse({
    itemId: formData.get("itemId"),
    url: formData.get("url"),
    title: formData.get("title") || undefined,
  });
  if (!parsed.success) return failure("Valid URL required");

  const item = await ownItem(parsed.data.itemId);
  if (!item) return failure("Not found");

  await db.insert(learningResources).values({
    itemId: item.id,
    url: parsed.data.url,
    title: parsed.data.title || null,
  });
  refresh();
  return { ok: true };
}

export async function deleteResource(formData: FormData): Promise<ActionResult> {
  const parsed = resourceIdSchema.safeParse({
    resourceId: formData.get("resourceId"),
  });
  if (!parsed.success) return failure("Invalid");

  const [res] = await db
    .select({ itemId: learningResources.itemId })
    .from(learningResources)
    .where(eq(learningResources.id, parsed.data.resourceId))
    .limit(1);
  const item = res ? await ownItem(res.itemId) : null;
  if (!item) return failure("Not found");

  await db.delete(learningResources).where(eq(learningResources.id, parsed.data.resourceId));
  refresh();
  return { ok: true };
}

export async function addLearningNote(formData: FormData): Promise<ActionResult> {
  const parsed = addNoteSchema.safeParse({
    itemId: formData.get("itemId"),
    body: formData.get("body"),
  });
  if (!parsed.success) return failure("Write something first");

  const item = await ownItem(parsed.data.itemId);
  if (!item) return failure("Not found");

  await db.insert(learningNotes).values({
    itemId: item.id,
    body: parsed.data.body,
  });
  refresh();
  return { ok: true };
}

export async function deleteLearningNote(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = noteIdSchema.safeParse({ noteId: formData.get("noteId") });
  if (!parsed.success) return failure("Invalid");

  const [note] = await db
    .select({ itemId: learningNotes.itemId })
    .from(learningNotes)
    .where(eq(learningNotes.id, parsed.data.noteId))
    .limit(1);
  const item = note ? await ownItem(note.itemId) : null;
  if (!item) return failure("Not found");

  await db.delete(learningNotes).where(eq(learningNotes.id, parsed.data.noteId));
  refresh();
  return { ok: true };
}

export async function linkItemToBoard(
  formData: FormData,
): Promise<ActionResult<{ cardId: string; projectId: string }>> {
  const parsed = linkToBoardSchema.safeParse({
    itemId: formData.get("itemId"),
    projectId: formData.get("projectId"),
  });
  if (!parsed.success) return failure("Invalid");

  const item = await ownItem(parsed.data.itemId);
  if (!item) return failure("Not found");
  const ctx = await requireMembership(parsed.data.projectId, "member");

  const existing = await db
    .select({ id: cardLinks.id })
    .from(cardLinks)
    .where(eq(cardLinks.learningItemId, item.id))
    .limit(1);
  if (existing.length > 0) {
    return failure("Already linked to a board card");
  }

  const [todoBoard] = await db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.projectId, ctx.projectId), eq(boards.kind, "todo")))
    .limit(1);
  if (!todoBoard) return failure("Project has no To-Do board");

  const [firstColumn] = await db
    .select({ id: columns.id })
    .from(columns)
    .where(and(eq(columns.boardId, todoBoard.id), isNull(columns.deletedAt)))
    .orderBy(asc(columns.position))
    .limit(1);
  if (!firstColumn) return failure("No columns on To-Do board");

  const descriptionBits = [
    item.sourceUrl ? `Source: ${item.sourceUrl}` : null,
    item.whyNote ? `Why: ${item.whyNote}` : null,
    `From your learning tracker (${Math.round(Number(item.hoursLogged))}h logged)`,
  ].filter(Boolean);

  const [last] = await db
    .select({ position: cards.position })
    .from(cards)
    .where(and(eq(cards.columnId, firstColumn.id), isNull(cards.deletedAt)))
    .orderBy(asc(cards.position))
    .limit(1);

  const [card] = await db
    .insert(cards)
    .values({
      columnId: firstColumn.id,
      boardId: todoBoard.id,
      projectId: ctx.projectId,
      title: `${item.title}`,
      description: descriptionBits.join("\n"),
      position: generateKeyBetween(last?.position ?? null, null),
      createdBy: ctx.userId,
    })
    .returning({ id: cards.id });

  await db.insert(cardLinks).values({
    cardId: card.id,
    learningItemId: item.id,
  });

  refresh();
  return { ok: true, data: { cardId: card.id, projectId: ctx.projectId } };
}
