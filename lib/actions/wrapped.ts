import { and, asc, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  boards,
  cards,
  dayReviews,
  expenseCategories,
  expenses,
  learningItems,
  learningSessions,
  memberships,
  projects,
} from "@/db/schema";
import { requireUser } from "@/lib/authz";
import { localDateParts } from "@/lib/dates";
import { monthWindow } from "@/lib/wrapped/month";
import { computeStats } from "@/lib/wrapped/stats";
import { pickArchetype, type Archetype } from "@/lib/wrapped/archetype";
import {
  WRAPPED_UNLOCK_DAYS,
  type AllTimeTotals,
  type ClosedReviewRow,
  type CompletedCardRow,
  type ExpenseRow,
  type IdeaCardRow,
  type LearningSessionRow,
  type WrappedStats,
} from "@/lib/wrapped/types";

export type WrappedGate = {
  monthLabel: string;
  activeCount: number;
  threshold: number;
  daysInMonth: number;
};

export type WrappedPayload =
  | ({ status: "locked" | "empty" } & WrappedGate)
  | {
      status: "ready";
      monthLabel: string;
      stats: WrappedStats;
      archetype: Archetype;
    };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function localDateString(date: Date, timeZone: string): string {
  const { y, m, d } = localDateParts(date, timeZone);
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

async function allTimeTotals(userId: string): Promise<AllTimeTotals> {
  const [[loops], [minutes], [firstActivity], [firstCard]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(cards)
      .innerJoin(projects, eq(cards.projectId, projects.id))
      .innerJoin(
        memberships,
        and(eq(memberships.projectId, projects.id), eq(memberships.userId, userId)),
      )
      .where(and(isNull(cards.deletedAt), isNotNull(cards.completedAt))),
    db
      .select({ m: sql<number>`coalesce(sum(${learningSessions.minutes}), 0)::int` })
      .from(learningSessions)
      .innerJoin(learningItems, eq(learningSessions.itemId, learningItems.id))
      .where(and(eq(learningItems.userId, userId), isNull(learningItems.deletedAt))),
    db
      .select({ at: activities.createdAt })
      .from(activities)
      .where(eq(activities.actorId, userId))
      .orderBy(asc(activities.createdAt))
      .limit(1),
    db
      .select({ at: cards.createdAt })
      .from(cards)
      .where(eq(cards.createdBy, userId))
      .orderBy(asc(cards.createdAt))
      .limit(1),
  ]);

  const candidates = [firstActivity?.at, firstCard?.at].filter(Boolean);
  const since = candidates.length
    ? new Date(Math.min(...candidates.map((d) => d!.getTime())))
    : null;

  return {
    loopsClosed: loops?.n ?? 0,
    minutesLearned: minutes?.m ?? 0,
    sinceDate: since ? since.toISOString().slice(0, 10) : null,
  };
}

export async function loadWrappedMonth(
  timeZone: string,
  year: number,
  monthIndex: number,
): Promise<WrappedPayload> {
  const userId = await requireUser();

  const win = monthWindow(new Date(), timeZone, year, monthIndex);
  const startDay = localDateString(win.start, timeZone);
  const endDayExclusive = localDateString(win.end, timeZone);

  const [completedCards, ideas, sessions, expenseRows, reviews, allTime] =
    await Promise.all([
      db
        .select({
          id: cards.id,
          title: cards.title,
          projectName: projects.name,
          projectEmoji: projects.emoji,
          completedAt: cards.completedAt,
        })
        .from(cards)
        .innerJoin(projects, eq(cards.projectId, projects.id))
        .innerJoin(
          memberships,
          and(eq(memberships.projectId, projects.id), eq(memberships.userId, userId)),
        )
        .where(
          and(
            isNull(cards.deletedAt),
            isNotNull(cards.completedAt),
            gte(cards.completedAt, win.start),
            lt(cards.completedAt, win.end),
          ),
        ),
      db
        .select({ id: cards.id, title: cards.title })
        .from(cards)
        .innerJoin(boards, and(eq(cards.boardId, boards.id), eq(boards.kind, "ideas")))
        .innerJoin(
          memberships,
          and(eq(memberships.projectId, cards.projectId), eq(memberships.userId, userId)),
        )
        .where(
          and(
            isNull(cards.deletedAt),
            gte(cards.createdAt, win.start),
            lt(cards.createdAt, win.end),
          ),
        ),
      db
        .select({
          minutes: learningSessions.minutes,
          itemTitle: learningItems.title,
          happenedOn: learningSessions.happenedOn,
        })
        .from(learningSessions)
        .innerJoin(learningItems, eq(learningSessions.itemId, learningItems.id))
        .where(
          and(
            eq(learningItems.userId, userId),
            isNull(learningItems.deletedAt),
            gte(learningSessions.happenedOn, startDay),
            lt(learningSessions.happenedOn, endDayExclusive),
          ),
        ),
      db
        .select({
          amountMinor: expenses.amountMinor,
          currency: expenses.currency,
          categoryName: expenseCategories.name,
          categoryEmoji: expenseCategories.emoji,
          spentOn: expenses.spentOn,
        })
        .from(expenses)
        .innerJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
        .where(
          and(
            eq(expenses.userId, userId),
            isNull(expenses.deletedAt),
            gte(expenses.spentOn, startDay),
            lt(expenses.spentOn, endDayExclusive),
          ),
        ),
      db
        .select({ date: dayReviews.date })
        .from(dayReviews)
        .where(
          and(
            eq(dayReviews.userId, userId),
            eq(dayReviews.closed, true),
            gte(dayReviews.closedAt, win.start),
            lt(dayReviews.closedAt, win.end),
          ),
        ),
      allTimeTotals(userId),
    ]);

  const stats = computeStats({
    timeZone,
    year,
    monthIndex,
    completedCards: completedCards as CompletedCardRow[],
    ideas: ideas as IdeaCardRow[],
    sessions: sessions as LearningSessionRow[],
    expenses: expenseRows as ExpenseRow[],
    closedReviews: reviews as ClosedReviewRow[],
    allTime,
  });

  const gate = {
    monthLabel: stats.monthLabel,
    activeCount: stats.activeDays.length,
    threshold: WRAPPED_UNLOCK_DAYS,
    daysInMonth: stats.daysInMonth,
  };

  if (stats.activeDays.length === 0) {
    return { status: "empty", ...gate };
  }
  if (stats.activeDays.length < WRAPPED_UNLOCK_DAYS) {
    return { status: "locked", ...gate };
  }
  return {
    status: "ready",
    monthLabel: stats.monthLabel,
    stats,
    archetype: pickArchetype(stats),
  };
}
