import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/authz";
import { dayWindowForDateKey, localDateKey, shiftDateKey, todayWindow } from "@/lib/dates";
import { loadDueCards } from "@/lib/kanban/due-cards";
import {
  groupUpcomingRows,
  monthLabel,
  resolveFromParam,
  weekStripDays,
} from "@/lib/kanban/upcoming";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonStyles } from "@/components/ui/button";
import { WeekStrip } from "@/components/kanban/week-strip";
import { OverdueGroup, DayGroupSection } from "@/components/kanban/upcoming-list";

const AGENDA_DAYS = 14;

type Props = { searchParams: Promise<{ from?: string }> };

export const metadata: Metadata = { title: "Upcoming" };

export default async function UpcomingPage({ searchParams }: Props) {
  const userId = await requireUser();
  const sp = await searchParams;

  const [user] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const timeZone = user?.timezone || "UTC";

  const today = todayWindow(timeZone);
  const todayKey = localDateKey(today.start, timeZone);
  const fromKey = resolveFromParam(sp.from, todayKey);
  const isCurrentWindow = fromKey === todayKey;

  const windowStart = dayWindowForDateKey(fromKey, timeZone).start;
  const untilKey = shiftDateKey(fromKey, AGENDA_DAYS);
  const windowEnd = dayWindowForDateKey(untilKey, timeZone).start;

  const rows = await loadDueCards(
    userId,
    timeZone,
    today,
    isCurrentWindow ? { end: windowEnd } : { start: windowStart, end: windowEnd },
  );

  const { overdue, days } = groupUpcomingRows(rows, timeZone, {
    fromKey,
    todayKey,
    numDays: AGENDA_DAYS,
    includeOverdue: isCurrentWindow,
  });

  const cardDayKeys = new Set(days.map((g) => g.key));
  const weekPills = weekStripDays(fromKey, todayKey, cardDayKeys);
  const isEmpty = overdue.length === 0 && days.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Upcoming" subtitle={monthLabel(fromKey)} />

      <WeekStrip
        days={weekPills}
        prevHref={`/upcoming?from=${shiftDateKey(fromKey, -7)}`}
        nextHref={`/upcoming?from=${shiftDateKey(fromKey, 7)}`}
      />

      {isEmpty ? (
        <EmptyState
          icon="📅"
          title="Nothing on the horizon"
          description="Cards with a due date in this window show up here. Give a card a due date from any project to see it on your agenda."
          action={
            <Link href="/boards" className={buttonStyles({ variant: "secondary", size: "sm" })}>
              Open your boards
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          <OverdueGroup rows={overdue} timeZone={timeZone} />
          {days.map((group) => (
            <DayGroupSection key={group.key} group={group} timeZone={timeZone} />
          ))}
        </div>
      )}
    </div>
  );
}
