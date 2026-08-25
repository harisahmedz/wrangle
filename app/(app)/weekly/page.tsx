import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, gte, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import {
  boards,
  cards,
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
import { formatMinor } from "@/lib/money";
import { weekWindow, computeWeekReview } from "@/lib/weekly/stats";
import {
  PromoteTopIdeaButton,
  RescheduleAllButton,
} from "@/components/weekly/buttons";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Weekly review" };

type Props = { searchParams: Promise<{ w?: string }> };

function parseOffset(raw?: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 52) return 0;
  return n;
}

function localDateString(date: Date, timeZone: string): string {
  const { y, m, d } = localDateParts(date, timeZone);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export default async function WeeklyPage({ searchParams }: Props) {
  const userId = await requireUser();

  const [user] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const timeZone = user?.timezone || "UTC";

  const sp = await searchParams;
  const offsetWeeks = parseOffset(sp.w);
  const now = new Date();
  const win = weekWindow(now, timeZone, offsetWeeks);
  const lastWeekWin = weekWindow(now, timeZone, offsetWeeks + 1);

  const memberJoin = and(
    eq(memberships.projectId, projects.id),
    eq(memberships.userId, userId),
  );

  const [shippedRows, slippedRows, sessionRows, expenseRows, lastWeekExpenseRows, ideaRows] =
    await Promise.all([
      db
        .select({
          id: cards.id,
          title: cards.title,
          projectName: projects.name,
          projectEmoji: projects.emoji,
        })
        .from(cards)
        .innerJoin(projects, eq(cards.projectId, projects.id))
        .innerJoin(memberships, memberJoin)
        .where(
          and(
            isNull(cards.deletedAt),
            isNotNull(cards.completedAt),
            gte(cards.completedAt, win.start),
            lt(cards.completedAt, win.end),
          ),
        )
        .orderBy(asc(projects.name), asc(cards.completedAt)),
      db
        .select({
          id: cards.id,
          title: cards.title,
          projectName: projects.name,
          dueAt: cards.dueAt,
          isAllDay: cards.isAllDay,
        })
        .from(cards)
        .innerJoin(projects, eq(cards.projectId, projects.id))
        .innerJoin(memberships, memberJoin)
        .where(
          and(
            isNull(cards.deletedAt),
            isNull(cards.completedAt),
            gte(cards.dueAt, win.start),
            lt(cards.dueAt, now),
          ),
        )
        .orderBy(asc(cards.dueAt)),
      db
        .select({
          minutes: learningSessions.minutes,
          itemTitle: learningItems.title,
        })
        .from(learningSessions)
        .innerJoin(learningItems, eq(learningSessions.itemId, learningItems.id))
        .where(
          and(
            eq(learningItems.userId, userId),
            isNull(learningItems.deletedAt),
            gte(learningSessions.happenedOn, localDateString(win.start, timeZone)),
            lt(learningSessions.happenedOn, localDateString(win.end, timeZone)),
          ),
        ),
      db
        .select({
          amountMinor: expenses.amountMinor,
          currency: expenses.currency,
          categoryName: expenseCategories.name,
          categoryEmoji: expenseCategories.emoji,
        })
        .from(expenses)
        .innerJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
        .where(
          and(
            eq(expenses.userId, userId),
            isNull(expenses.deletedAt),
            gte(expenses.spentOn, localDateString(win.start, timeZone)),
            lt(expenses.spentOn, localDateString(win.end, timeZone)),
          ),
        ),
      db
        .select({
          amountMinor: expenses.amountMinor,
          currency: expenses.currency,
          categoryName: expenseCategories.name,
          categoryEmoji: expenseCategories.emoji,
        })
        .from(expenses)
        .innerJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
        .where(
          and(
            eq(expenses.userId, userId),
            isNull(expenses.deletedAt),
            gte(expenses.spentOn, localDateString(lastWeekWin.start, timeZone)),
            lt(expenses.spentOn, localDateString(lastWeekWin.end, timeZone)),
          ),
        ),
      db
        .select({
          id: cards.id,
          title: cards.title,
          impact: cards.impact,
          effort: cards.effort,
        })
        .from(cards)
        .innerJoin(boards, and(eq(cards.boardId, boards.id), eq(boards.kind, "ideas")))
        .innerJoin(memberships, memberJoin)
        .where(
          and(
            isNull(cards.deletedAt),
            gte(cards.createdAt, win.start),
            lt(cards.createdAt, win.end),
          ),
        )
        .orderBy(asc(cards.createdAt)),
    ]);

  const review = computeWeekReview({
    now,
    timeZone,
    offsetWeeks,
    shipped: shippedRows,
    slipped: slippedRows.map((r) => ({
      ...r,
      dueAt: r.dueAt ?? new Date(0),
    })),
    sessions: sessionRows,
    expenses: expenseRows,
    lastWeekExpenses: lastWeekExpenseRows,
    ideas: ideaRows,
  });

  const isEmptyWeek =
    review.shippedCount === 0 &&
    review.slipped.length === 0 &&
    review.sessionCount === 0 &&
    expenseRows.length === 0 &&
    review.ideasCaptured === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Weekly review</h1>
          <p className="text-xs text-muted">{review.weekLabel}</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1 text-sm">
          {offsetWeeks > 0 ? (
            <>
              <Link
                href={offsetWeeks === 1 ? "/weekly" : `/weekly?w=${offsetWeeks - 1}`}
                aria-label="Later week"
                className="rounded px-2 py-1 text-muted hover:text-text"
              >
                →
              </Link>
              <span className="min-w-20 text-center text-xs font-medium">
                {review.weekLabel}
              </span>
            </>
          ) : (
            <span className="px-2 py-1 text-xs text-muted">This week</span>
          )}
          <Link
            href={`/weekly?w=${offsetWeeks + 1}`}
            aria-label="Earlier week"
            className="rounded px-2 py-1 text-muted hover:text-text"
          >
            ←
          </Link>
        </div>
      </div>

      {/* Slipped */}
      <section className="space-y-2 rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">
            Slipped{" "}
            <span className="ml-1 text-xs font-normal tabular-nums text-muted">
              went overdue this week
            </span>
          </h2>
          {review.slipped.length > 0 && (
            <RescheduleAllButton slippedCount={review.slipped.length} />
          )}
        </div>
        {review.slipped.length === 0 ? (
          <p className="text-xs text-muted">Nothing slipped this week.</p>
        ) : (
          <ul className="divide-y divide-border">
            {review.slipped.map((card) => (
              <li key={card.id} className="flex items-center justify-between py-2 text-sm">
                <span className="truncate">{card.title}</span>
                <span className="ml-2 shrink-0 text-xs text-muted">
                  {card.projectName}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Shipped */}
      <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-medium">
          Shipped{" "}
          <span className="ml-1 text-xs font-normal tabular-nums text-muted">
            {review.shippedCount} closed
          </span>
        </h2>
        {review.shippedByProject.length === 0 ? (
          <p className="text-xs text-muted">
            Nothing closed yet — the week isn&apos;t over.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {review.shippedByProject.map((group) => (
              <div key={group.name} className="rounded-lg border border-border p-3">
                <p className="mb-1 text-xs text-muted">
                  {group.emoji ? `${group.emoji} ` : ""}
                  {group.name}{" "}
                  <span className="tabular-nums">· {group.cards.length}</span>
                </p>
                <ul className="space-y-1 text-sm">
                  {group.cards.slice(0, 5).map((c) => (
                    <li key={c.id} className="truncate">
                      ✓ {c.title}
                    </li>
                  ))}
                  {group.cards.length > 5 && (
                    <li className="text-xs text-muted tabular-nums">
                      +{group.cards.length - 5} more
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Learned */}
        <section className="space-y-2 rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-medium">Learned</h2>
          <p className="font-mono text-2xl font-semibold tabular-nums">
            {(review.learningMinutesTotal / 60).toFixed(1)}h
          </p>
          <p className="text-xs text-muted tabular-nums">
            {review.sessionCount} session{review.sessionCount === 1 ? "" : "s"}
          </p>
          {review.topLearningItem && (
            <p className="text-xs text-muted truncate">
              Top: {review.topLearningItem.title} ·{" "}
              <span className="tabular-nums">{review.topLearningItem.minutes}m</span>
            </p>
          )}
        </section>

        {/* Spent */}
        <section className="space-y-2 rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-medium">Spent</h2>
          <p className="font-mono text-2xl font-semibold tabular-nums">
            {review.dominantCurrency
              ? formatMinor(review.spentMinorTotal, review.dominantCurrency)
              : "$0.00"}
          </p>
          {review.lastWeekSpentMinor > 0 && review.spentMinorTotal !== review.lastWeekSpentMinor && (
            <p className="text-xs text-muted tabular-nums">
              vs {formatMinor(review.lastWeekSpentMinor, review.dominantCurrency ?? "USD")}{" "}
              last week
              {review.spentMinorTotal < review.lastWeekSpentMinor ? " ↓" : " ↑"}
            </p>
          )}
          {review.otherCurrencyTotals.map((o) => (
            <p key={o.currency} className="text-xs text-muted tabular-nums">
              {formatMinor(o.minor, o.currency)}
            </p>
          ))}
          {review.topCategory && (
            <p className="text-xs text-muted truncate">
              Top: {review.topCategory.emoji} {review.topCategory.name} ·{" "}
              <span className="tabular-nums">
                {formatMinor(review.topCategory.minor, review.dominantCurrency ?? "USD")}
              </span>
            </p>
          )}
        </section>
      </div>

      {/* Captured */}
      <section className="space-y-2 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-medium">
          Captured{" "}
          <span className="ml-1 text-xs font-normal tabular-nums text-muted">
            {review.ideasCaptured} idea{review.ideasCaptured === 1 ? "" : "s"}
          </span>
        </h2>
        {review.topIdea ? (
          <div className="flex items-center justify-between gap-3">
            <div className="truncate text-sm">
              💡 {review.topIdea.title}{" "}
              <span className="ml-1 font-mono text-xs tabular-nums text-accent-strong">
                {review.topIdea.score > 0 ? `+${review.topIdea.score}` : review.topIdea.score}
              </span>
            </div>
            <PromoteTopIdeaButton cardId={review.topIdea.id} />
          </div>
        ) : (
          <p className="text-xs text-muted">
            No scored ideas this week.
          </p>
        )}
      </section>

      {!review.containsToday && (
        <Link
          href="/weekly"
          className="block text-center text-xs text-muted hover:text-text"
        >
          Back to this week →
        </Link>
      )}

      {isEmptyWeek && (
        <EmptyState
          icon="🗓️"
          title="A quiet week"
          description="Nothing shipped, learned, spent or captured yet."
        />
      )}
    </div>
  );
}
