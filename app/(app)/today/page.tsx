import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { boards, cards, memberships, projects, users } from "@/db/schema";
import { requireUser } from "@/lib/authz";
import { todayWindow, upcomingWindow } from "@/lib/dates";
import {
  EmptyToday,
  TodayList,
  type TodayRow,
} from "@/components/kanban/today-list";
import {
  QuickAddTrigger,
} from "@/components/pwa/triggers";

type Props = { searchParams: Promise<{ title?: string; text?: string; link?: string; quick?: string }> };

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
  const upcoming = upcomingWindow(timeZone);
  const weekEnd = new Date(upcoming.start.getTime() + 7 * 86_400_000);

  const rows = await db
    .select({
      id: cards.id,
      title: cards.title,
      dueAt: cards.dueAt,
      projectId: projects.id,
      projectName: projects.name,
      boardKind: boards.kind,
      isAllDay: cards.isAllDay,
      isPast: sql<boolean>`(${cards.dueAt} < now())`,
    })
    .from(cards)
    .innerJoin(projects, eq(cards.projectId, projects.id))
    .innerJoin(boards, eq(cards.boardId, boards.id))
    .innerJoin(
      memberships,
      and(eq(memberships.projectId, projects.id), eq(memberships.userId, userId)),
    )
    .where(
      and(
        isNull(cards.deletedAt),
        gte(cards.dueAt, today.start),
        lt(cards.dueAt, weekEnd),
      ),
    )
    .orderBy(asc(cards.dueAt));

  const dueTodayOrOverdue: TodayRow[] = [];
  const dueThisWeek: TodayRow[] = [];

  for (const r of rows) {
    const due = new Date(r.dueAt!);
    const row: TodayRow = {
      id: r.id,
      title: r.title,
      projectId: r.projectId,
      projectName: r.projectName,
      boardKind: r.boardKind,
      dueAt: due,
      overdue: r.isPast,
    };
    if (r.dueAt!.getTime() < today.end.getTime()) {
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

  const [{ projectCount }] = await db
    .select({ projectCount: sql<number>`count(*)::int` })
    .from(memberships)
    .where(eq(memberships.userId, userId));
  const onboarding = projectCount === 0;

  return (
    <div className="space-y-8">
      {(sharedText || sp.quick || sp.title) && (
        <QuickAddTrigger prefill={sp.title ? `${sp.title} ${sharedText ?? ""}`.trim() : (sharedText ?? "")} />
      )}
      <h1 className="text-2xl font-bold tracking-tight">Today</h1>

      <Link
        href="/shutdown"
        className="block rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:bg-surface-2"
      >
        <span className="block text-sm font-medium">Close the day →</span>
        <span className="mt-0.5 block text-xs text-muted">
          The Shutdown — plan tomorrow, let go of the rest.
        </span>
      </Link>

      {onboarding ? (
        <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
          <h2 className="font-semibold">Welcome to Wrangle 👋</h2>
          <ol className="space-y-2 text-sm text-muted">
            <li>
              <b className="text-text">1.</b> Create a project from the sidebar
              (or just use <b className="text-text">My Space</b>).
            </li>
            <li>
              <b className="text-text">2.</b> Open its board and add cards —
              drag them across columns.
            </li>
            <li>
              <b className="text-text">3.</b> Give cards due dates — they&apos;ll
              show up right here every morning.
            </li>
          </ol>
        </section>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
              Due today &amp; overdue ({dueTodayOrOverdue.length})
            </h2>
            {dueTodayOrOverdue.length === 0 ? (
              <EmptyToday />
            ) : (
              groupByProject(dueTodayOrOverdue).map(([project, projectRows]) => (
                <div key={project} className="space-y-1.5">
                  <p className="px-1 text-xs font-medium text-muted">{project}</p>
                  <TodayList rows={projectRows} />
                </div>
              ))
            )}
          </section>

          {dueThisWeek.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
                Next 7 days ({dueThisWeek.length})
              </h2>
              {groupByProject(dueThisWeek).map(([project, projectRows]) => (
                <div key={project} className="space-y-1.5">
                  <p className="px-1 text-xs font-medium text-muted">{project}</p>
                  <TodayList rows={projectRows} />
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
