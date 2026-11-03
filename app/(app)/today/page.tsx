import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { cards, memberships, projects, users } from "@/db/schema";
import { requireUser } from "@/lib/authz";
import { dayWindowForDateKey, localDateKey, shiftDateKey, todayWindow } from "@/lib/dates";
import { loadDueCards } from "@/lib/kanban/due-cards";
import {
  EmptyToday,
  TodayList,
  type TodayRow,
} from "@/components/kanban/today-list";
import {
  DumpTrigger,
  QuickAddTrigger,
} from "@/components/pwa/triggers";
import { ChevronRightIcon } from "@/components/icons";
import { PageHeader } from "@/components/ui/page-header";

type Props = {
  searchParams: Promise<{ title?: string; text?: string; link?: string; quick?: string; dump?: string; voice?: string }>;
};

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage({ searchParams }: Props) {
  const userId = await requireUser();

  const sp = await searchParams;
  const sharedText =
    [sp.text, sp.link].filter(Boolean).join(" ").slice(0, 280) || null;

  const [user] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const timeZone = user?.timezone || "UTC";

  const today = todayWindow(timeZone);
  // "Next up"/the Upcoming hand-off only needs a generous look-ahead, not a
  // precise boundary — 8 local days from today (today + 7 more), computed
  // via the DST-correct day-key helpers rather than naive +ms math.
  const weekEndKey = shiftDateKey(localDateKey(today.start, timeZone), 8);
  const weekEnd = dayWindowForDateKey(weekEndKey, timeZone).start;

  const rows = await loadDueCards(userId, timeZone, today, { end: weekEnd });

  const dueTodayOrOverdue: TodayRow[] = [];
  const dueThisWeek: TodayRow[] = [];

  for (const row of rows) {
    if (row.dueAt.getTime() < today.end.getTime()) {
      dueTodayOrOverdue.push(row);
    } else {
      dueThisWeek.push(row);
    }
  }

  const groupByProject = (list: TodayRow[]) => {
    const map = new Map<string, TodayRow[]>();
    for (const row of list) {
      const arr = map.get(row.projectName) ?? [];
      arr.push(row);
      map.set(row.projectName, arr);
    }
    return [...map.entries()];
  };

  const [{ cardCount }] = await db
    .select({ cardCount: sql<number>`count(${cards.id})::int` })
    .from(cards)
    .innerJoin(projects, eq(cards.projectId, projects.id))
    .innerJoin(
      memberships,
      and(eq(memberships.projectId, projects.id), eq(memberships.userId, userId)),
    )
    .where(
      and(
        isNull(cards.deletedAt),
        isNull(projects.deletedAt),
        isNull(projects.archivedAt),
      ),
    );
  const onboarding = cardCount === 0;

  return (
    <div className="space-y-8">
      {(sharedText || sp.quick || sp.title) && (
        <QuickAddTrigger prefill={sp.title ? `${sp.title} ${sharedText ?? ""}`.trim() : (sharedText ?? "")} />
      )}
      {(sp.dump || sp.voice) && <DumpTrigger sharedAudio={sp.voice === "1"} />}
      <PageHeader title="Today" />

      {onboarding ? (
        <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
          <h2 className="font-semibold">Welcome to Wrangle 👋</h2>
          <ol className="space-y-2 text-sm text-muted">
            <li>
              <b className="text-text">1.</b> Create a project from the sidebar
              (or just use <b className="text-text">My Space</b>).
            </li>
            <li>
              <b className="text-text">2.</b> Open its board and add cards, then
              drag them across columns.
            </li>
            <li>
              <b className="text-text">3.</b> Give cards due dates. They&apos;ll
              show up right here every morning.
            </li>
          </ol>
        </section>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted">
              Due today &amp; overdue ({dueTodayOrOverdue.length})
            </h2>
            {dueTodayOrOverdue.length === 0 ? (
              <EmptyToday />
            ) : (
              groupByProject(dueTodayOrOverdue).map(([project, projectRows]) => (
                <div key={project} className="space-y-1.5">
                  <p className="px-1 text-xs font-medium text-muted">{project}</p>
                  <TodayList rows={projectRows} timeZone={timeZone} />
                </div>
              ))
            )}
          </section>

          {(dueTodayOrOverdue.length > 0 || dueThisWeek.length > 0) && (
            <section className="space-y-3">
              {dueThisWeek.length > 0 && (
                <>
                  <h2 className="text-sm font-medium text-muted">Next up</h2>
                  <TodayList rows={dueThisWeek.slice(0, 3)} timeZone={timeZone} showProject />
                </>
              )}
              <Link
                href="/upcoming"
                className="flex items-center gap-1 px-1 text-xs font-medium text-accent hover:text-accent-strong"
              >
                See upcoming
                <ChevronRightIcon className="h-3.5 w-3.5" />
              </Link>
            </section>
          )}
        </>
      )}

      <Link
        href="/shutdown"
        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:bg-surface-2"
      >
        <span>
          <span className="block text-sm font-medium">Close the day</span>
          <span className="mt-0.5 block text-xs text-muted">
            The Shutdown: plan tomorrow, let go of the rest.
          </span>
        </span>
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted" />
      </Link>
    </div>
  );
}
