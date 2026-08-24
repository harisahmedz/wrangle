import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  cards,
  dayReviews,
  expenses,
  learningItems,
  learningSessions,
  memberships,
  projects,
  users,
} from "@/db/schema";
import { requireUser } from "@/lib/authz";
import { todayWindow } from "@/lib/dates";
import {
  consistencyStats,
  groupByProject,
  localDateKey,
} from "@/lib/shutdown/stats";
import { formatMinor } from "@/lib/money";
import {
  FocusPicker,
  type FocusedCard,
  type FocusCandidate,
} from "@/components/shutdown/focus-picker";
import {
  EmptyLeftovers,
  LeftoverList,
  type LeftoverRow,
} from "@/components/shutdown/leftover-list";
import { DayNote } from "@/components/shutdown/day-note";
import {
  CloseDayButton,
  ReopenDayButton,
} from "@/components/shutdown/close-day";

export const metadata: Metadata = { title: "Shutdown" };

const memberJoin = (userId: string) =>
  and(
    eq(memberships.projectId, cards.projectId),
    eq(memberships.userId, userId),
  );

export default async function ShutdownPage() {
  const userId = await requireUser();

  const [user] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const timeZone = user?.timezone || "UTC";
  const now = new Date();
  const today = todayWindow(timeZone);
  const todayKey = localDateKey(now, timeZone);

  const headerParts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(now);
  const partValue = (type: string) =>
    headerParts.find((p) => p.type === type)?.value ?? "";
  const headerLabel = `${partValue("weekday")} ${partValue("day")} ${partValue("month")}`;

  const [
    focusedRows,
    leftoverRows,
    closedAgg,
    learnedAgg,
    spentAgg,
    todayReviewRows,
    closedDateRows,
  ] = await Promise.all([
    db
      .select({
        id: cards.id,
        title: cards.title,
        projectName: projects.name,
      })
      .from(cards)
      .innerJoin(projects, eq(cards.projectId, projects.id))
      .innerJoin(memberships, memberJoin(userId))
      .where(
        and(
          isNull(cards.deletedAt),
          isNull(cards.completedAt),
          eq(cards.focusedOn, todayKey),
        ),
      )
      .orderBy(asc(cards.dueAt)),
    db
      .select({
        id: cards.id,
        title: cards.title,
        projectName: projects.name,
        dueAt: cards.dueAt,
        focusedOn: cards.focusedOn,
        isPast: sql<boolean>`(${cards.dueAt} < now())`,
      })
      .from(cards)
      .innerJoin(projects, eq(cards.projectId, projects.id))
      .innerJoin(memberships, memberJoin(userId))
      .where(
        and(
          isNull(cards.deletedAt),
          isNull(cards.completedAt),
          lt(cards.dueAt, today.end),
        ),
      )
      .orderBy(asc(cards.dueAt)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(cards)
      .innerJoin(memberships, memberJoin(userId))
      .where(
        and(
          isNull(cards.deletedAt),
          gte(cards.completedAt, today.start),
          lt(cards.completedAt, today.end),
        ),
      ),
    db
      .select({
        minutes: sql<number>`coalesce(sum(${learningSessions.minutes}), 0)::int`,
      })
      .from(learningSessions)
      .innerJoin(learningItems, eq(learningSessions.itemId, learningItems.id))
      .where(
        and(
          eq(learningItems.userId, userId),
          isNull(learningItems.deletedAt),
          eq(learningSessions.happenedOn, todayKey),
        ),
      ),
    db
      .select({
        minor: sql<number>`coalesce(sum(${expenses.amountMinor}), 0)::int`,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          isNull(expenses.deletedAt),
          eq(expenses.spentOn, todayKey),
        ),
      ),
    db
      .select()
      .from(dayReviews)
      .where(
        and(eq(dayReviews.userId, userId), eq(dayReviews.date, todayKey)),
      )
      .limit(1),
    db
      .select({ date: dayReviews.date })
      .from(dayReviews)
      .where(and(eq(dayReviews.userId, userId), eq(dayReviews.closed, true)))
      .orderBy(asc(dayReviews.date)),
  ]);

  const todayReview = todayReviewRows[0] ?? null;
  const stats = consistencyStats(
    closedDateRows.map((r) => r.date),
    todayKey,
  );
  const consistencyLine = `Closed ${stats.closedLast7} of the last 7 days · ${stats.totalAllTime} all-time`;

  const toRow = (r: (typeof leftoverRows)[number]): LeftoverRow & {
    focused: boolean;
  } => ({
    id: r.id,
    title: r.title,
    projectName: r.projectName,
    dueAt: r.dueAt ? new Date(r.dueAt) : today.end,
    overdue: r.isPast,
    focused: r.focusedOn === todayKey,
  });

  const leftovers = leftoverRows.map(toRow);
  const candidates: FocusCandidate[] = leftovers
    .filter((r) => !r.focused)
    .map((r) => ({
      id: r.id,
      title: r.title,
      projectName: r.projectName,
      dueAt: r.dueAt,
      overdue: r.overdue,
    }));
  const focusedCards: FocusedCard[] = focusedRows.slice(0, 3).map((r) => ({
    id: r.id,
    title: r.title,
    projectName: r.projectName,
  }));

  const consistencyStrip = (
    <section className="rounded-xl border border-border bg-surface p-4">
      <p className="text-sm text-muted">{consistencyLine}</p>
      {stats.showNeverMissTwiceNudge && (
        <p className="mt-1 text-sm">
          Missed yesterday — closing today keeps the rhythm.
        </p>
      )}
    </section>
  );

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold tracking-tight">
        Shutdown · {headerLabel}
      </h1>

      {todayReview?.closed ? (
        <section className="space-y-4 rounded-xl border border-border bg-surface p-6 text-center">
          <p className="text-lg font-semibold">Day closed.</p>
          <p className="text-sm text-muted">{consistencyLine}</p>
          <ReopenDayButton />
          <Link
            href="/today"
            className="block min-h-[44px] px-4 py-2 text-sm font-medium text-accent-strong hover:underline"
          >
            Back to Today
          </Link>
        </section>
      ) : (
        <>
          <FocusPicker focused={focusedCards} candidates={candidates} />

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
              Left from today ({leftovers.length})
            </h2>
            {leftovers.length === 0 ? (
              <EmptyLeftovers />
            ) : (
              groupByProject(leftovers).map(([project, rows]) => (
                <div key={project} className="space-y-2">
                  <p className="px-1 text-xs font-medium text-muted">
                    {project}
                  </p>
                  <LeftoverList rows={rows} />
                </div>
              ))
            )}
          </section>

          <section className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm text-muted">
              Today: {closedAgg[0].n} closed · {learnedAgg[0].minutes}m learned
              · {formatMinor(spentAgg[0].minor)} spent
            </p>
          </section>

          <DayNote initialNote={todayReview?.note ?? ""} />

          <CloseDayButton />
        </>
      )}

      {consistencyStrip}
    </div>
  );
}
