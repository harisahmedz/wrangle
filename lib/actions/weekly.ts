"use server";

import { refresh } from "next/cache";
import { and, asc, eq, gte, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { activities, cards, memberships, users } from "@/db/schema";
import { requireUser } from "@/lib/authz";
import { localDayWindow } from "@/lib/dates";
import { weekWindow } from "@/lib/weekly/stats";
import { type ActionResult } from "@/lib/actions/types";

const HOUR_MS = 3_600_000;

async function userTimeZone(userId: string): Promise<string> {
  const [row] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.timezone || "UTC";
}

/** Reschedule every not-completed card that went overdue this week to the same local time next week. */
export async function rescheduleOverdueToNextWeek(): Promise<
  ActionResult<{ count: number }>
> {
  const userId = await requireUser();

  const timeZone = await userTimeZone(userId);
  const now = new Date();
  const win = weekWindow(now, timeZone);

  const rows = await db
    .select({
      id: cards.id,
      projectId: cards.projectId,
      dueAt: cards.dueAt,
      isAllDay: cards.isAllDay,
    })
    .from(cards)
    .innerJoin(
      memberships,
      and(
        eq(memberships.projectId, cards.projectId),
        eq(memberships.userId, userId),
      ),
    )
    .where(
      and(
        isNull(cards.deletedAt),
        isNull(cards.completedAt),
        gte(cards.dueAt, win.start),
        lt(cards.dueAt, now),
      ),
    )
    .orderBy(asc(cards.dueAt));

  for (const card of rows) {
    if (card.dueAt === null) continue;
    const targetDay = localDayWindow(card.dueAt, timeZone, 7);
    const nextDue = card.isAllDay
      ? new Date(targetDay.start.getTime() + 12 * HOUR_MS)
      : new Date(targetDay.start.getTime() + (card.dueAt.getTime() - localDayWindow(card.dueAt, timeZone).start.getTime()));

    await db
      .update(cards)
      .set({ dueAt: nextDue, focusedOn: null })
      .where(eq(cards.id, card.id));

    await db.insert(activities).values({
      projectId: card.projectId,
      actorId: userId,
      entityType: "card",
      entityId: card.id,
      verb: "postponed",
      meta: { via: "weekly" },
    });
  }

  if (rows.length > 0) refresh();
  return { ok: true, data: { count: rows.length } };
}
