"use server";

import { refresh } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, cards, dayReviews, memberships, users } from "@/db/schema";
import { requireMembership, requireUser } from "@/lib/authz";
import { localDayWindow } from "@/lib/dates";
import { localDateKey } from "@/lib/shutdown/stats";
import {
  closeDaySchema,
  dayNoteSchema,
  shutdownCardSchema,
} from "@/lib/validation/shutdown";
import { failure, type ActionResult } from "@/lib/actions/types";

const HOUR_MS = 3_600_000;

async function userTimeZone(userId: string): Promise<string> {
  const [row] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.timezone || "UTC";
}

async function cardContext(cardId: string) {
  const [row] = await db
    .select({
      projectId: cards.projectId,
      dueAt: cards.dueAt,
      isAllDay: cards.isAllDay,
      completedAt: cards.completedAt,
      focusedOn: cards.focusedOn,
    })
    .from(cards)
    .where(and(eq(cards.id, cardId), isNull(cards.deletedAt)))
    .limit(1);
  return row ?? null;
}

async function logCardActivity(
  projectId: string,
  actorId: string,
  cardId: string,
  verb: string,
  meta?: Record<string, unknown>,
) {
  await db.insert(activities).values({
    projectId,
    actorId,
    entityType: "card",
    entityId: cardId,
    verb,
    meta,
  });
}

export async function setCardFocus(formData: FormData): Promise<ActionResult> {
  const parsed = shutdownCardSchema.safeParse({ cardId: formData.get("cardId") });
  if (!parsed.success) return failure("Invalid card");

  const card = await cardContext(parsed.data.cardId);
  if (!card) return failure("Card not found");
  const { userId } = await requireMembership(card.projectId, "member");
  if (card.completedAt !== null) {
    return failure("Completed cards can't be focused");
  }

  const timeZone = await userTimeZone(userId);
  const todayLocal = localDateKey(new Date(), timeZone);

  if (card.focusedOn !== todayLocal) {
    const [{ focusedCount }] = await db
      .select({ focusedCount: sql<number>`count(*)::int` })
      .from(cards)
      .innerJoin(
        memberships,
        and(
          eq(memberships.projectId, cards.projectId),
          eq(memberships.userId, userId),
        ),
      )
      .where(and(eq(cards.focusedOn, todayLocal), isNull(cards.deletedAt)));
    if (focusedCount >= 3) return failure("You can focus up to 3 cards");
  }

  await db
    .update(cards)
    .set({ focusedOn: todayLocal })
    .where(eq(cards.id, parsed.data.cardId));

  refresh();
  return { ok: true };
}

export async function clearCardFocus(formData: FormData): Promise<ActionResult> {
  const parsed = shutdownCardSchema.safeParse({ cardId: formData.get("cardId") });
  if (!parsed.success) return failure("Invalid card");

  const card = await cardContext(parsed.data.cardId);
  if (!card) return failure("Card not found");
  await requireMembership(card.projectId, "member");

  await db
    .update(cards)
    .set({ focusedOn: null })
    .where(eq(cards.id, parsed.data.cardId));

  refresh();
  return { ok: true };
}

export async function postponeCardToTomorrow(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = shutdownCardSchema.safeParse({ cardId: formData.get("cardId") });
  if (!parsed.success) return failure("Invalid card");

  const card = await cardContext(parsed.data.cardId);
  if (!card) return failure("Card not found");
  const { userId } = await requireMembership(card.projectId, "member");

  const timeZone = await userTimeZone(userId);
  const now = new Date();
  const tomorrow = localDayWindow(now, timeZone, 1);

  let nextDue: Date;
  if (card.dueAt === null) {
    nextDue = new Date(tomorrow.start.getTime() + 9 * HOUR_MS);
  } else if (card.isAllDay) {
    nextDue = new Date(tomorrow.start.getTime() + 12 * HOUR_MS);
  } else {
    const dayStart = localDayWindow(card.dueAt, timeZone).start.getTime();
    nextDue = new Date(tomorrow.start.getTime() + (card.dueAt.getTime() - dayStart));
  }

  await db
    .update(cards)
    .set({ dueAt: nextDue, focusedOn: null })
    .where(eq(cards.id, parsed.data.cardId));

  await logCardActivity(
    card.projectId,
    userId,
    parsed.data.cardId,
    "postponed",
  );

  refresh();
  return { ok: true };
}

export async function completeCardNow(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = shutdownCardSchema.safeParse({ cardId: formData.get("cardId") });
  if (!parsed.success) return failure("Invalid card");

  const card = await cardContext(parsed.data.cardId);
  if (!card) return failure("Card not found");
  const { userId } = await requireMembership(card.projectId, "member");

  if (card.completedAt === null) {
    await db
      .update(cards)
      .set({ completedAt: new Date(), focusedOn: null })
      .where(eq(cards.id, parsed.data.cardId));

    await logCardActivity(
      card.projectId,
      userId,
      parsed.data.cardId,
      "completed",
    );
  }

  refresh();
  return { ok: true };
}

export async function letGoOfCard(formData: FormData): Promise<ActionResult> {
  const parsed = shutdownCardSchema.safeParse({ cardId: formData.get("cardId") });
  if (!parsed.success) return failure("Invalid card");

  const card = await cardContext(parsed.data.cardId);
  if (!card) return failure("Card not found");
  const { userId } = await requireMembership(card.projectId, "member");

  await db
    .update(cards)
    .set({ dueAt: null, focusedOn: null })
    .where(eq(cards.id, parsed.data.cardId));

  await logCardActivity(
    card.projectId,
    userId,
    parsed.data.cardId,
    "let_go",
    { via: "shutdown" },
  );

  refresh();
  return { ok: true };
}

export async function saveDayNote(formData: FormData): Promise<ActionResult> {
  const userId = await requireUser();
  const parsed = dayNoteSchema.safeParse({ note: String(formData.get("note") ?? "") });
  if (!parsed.success) return failure("Notes are limited to 500 characters");

  const timeZone = await userTimeZone(userId);
  const todayLocal = localDateKey(new Date(), timeZone);

  await db
    .insert(dayReviews)
    .values({ userId, date: todayLocal, note: parsed.data.note })
    .onConflictDoUpdate({
      target: [dayReviews.userId, dayReviews.date],
      set: { note: parsed.data.note },
    });

  refresh();
  return { ok: true };
}

export async function closeDay(formData: FormData): Promise<ActionResult> {
  const userId = await requireUser();
  const raw = formData.get("note");
  const parsed = closeDaySchema.safeParse({
    note: raw === null ? undefined : String(raw),
  });
  if (!parsed.success) return failure("Notes are limited to 500 characters");

  const timeZone = await userTimeZone(userId);
  const todayLocal = localDateKey(new Date(), timeZone);
  const now = new Date();

  const patch: { closed: boolean; closedAt: Date; note?: string } = {
    closed: true,
    closedAt: now,
  };
  if (parsed.data.note !== undefined) patch.note = parsed.data.note;

  await db
    .insert(dayReviews)
    .values({
      userId,
      date: todayLocal,
      note: parsed.data.note ?? null,
      closed: true,
      closedAt: now,
    })
    .onConflictDoUpdate({
      target: [dayReviews.userId, dayReviews.date],
      set: patch,
    });

  refresh();
  return { ok: true };
}

export async function reopenDay(): Promise<ActionResult> {
  const userId = await requireUser();

  const timeZone = await userTimeZone(userId);
  const todayLocal = localDateKey(new Date(), timeZone);

  await db
    .update(dayReviews)
    .set({ closed: false, closedAt: null })
    .where(and(eq(dayReviews.userId, userId), eq(dayReviews.date, todayLocal)));

  refresh();
  return { ok: true };
}
