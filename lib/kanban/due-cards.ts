import { and, asc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { boards, cards, memberships, projects, users } from "@/db/schema";
import type { BoardKind, ProjectRole } from "@/db/schema";
import type { DayWindow } from "@/lib/dates";
import { normalizePriority } from "@/lib/kanban/priority";

export type DueCardRow = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  boardKind: BoardKind;
  dueAt: Date;
  /** True once the card is actually late (tone for TaskRow's meta line) — an
   * all-day card is overdue once its calendar day has passed, a timed card
   * once its instant has passed. Not the same as "belongs in Upcoming's
   * Overdue group" (that's day-key math the caller does against `today`). */
  overdue: boolean;
  /** The user's role on this card's project. The queued `card.complete`
   * (S8) requires "member"+, so a `viewer` row's checkbox must stay
   * non-interactive (TaskRow's `onToggle` left undefined) instead of
   * producing a failed outbox entry. */
  role: ProjectRole;
  /** ROADMAP-V2 S9: 1|2|3|null only (see lib/kanban/priority.ts). */
  priority: 1 | 2 | 3 | null;
};

export type DueCardsWindow = {
  /** Exclusive upper bound. */
  end: Date;
  /** Inclusive lower bound; omit to also pull in every older overdue card
   * (Today's behaviour). Upcoming passes this when paging to a week that
   * isn't "now", so it doesn't drag in the entire historical backlog. */
  start?: Date;
};

/**
 * Cards due in `window`, across every project `userId` is a member of —
 * the shared read behind Today's "Due today & overdue"/"Next up" teaser
 * and the Upcoming agenda (V2 S6). Excludes deleted/archived projects and
 * completed/deleted cards, ordered by due date.
 *
 * `today` is the caller's already-computed `todayWindow(timeZone)` — it's
 * needed here too (for the all-day overdue check), but is taken as a
 * parameter rather than recomputed so a request has exactly one "now"
 * snapshot instead of two independent `new Date()` calls that could
 * straddle a local-midnight boundary.
 */
export async function loadDueCards(
  userId: string,
  timeZone: string,
  today: DayWindow,
  window: DueCardsWindow,
): Promise<DueCardRow[]> {
  const [row] = await db
    // Raw sql isn't mapped through a column type, so the driver returns a string.
    .select({ now: sql<string>`now()` })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const now = row?.now ? new Date(row.now) : new Date(0);

  const rawRows = await db
    .select({
      id: cards.id,
      title: cards.title,
      dueAt: cards.dueAt,
      projectId: projects.id,
      projectName: projects.name,
      boardKind: boards.kind,
      isAllDay: cards.isAllDay,
      role: memberships.role,
      priority: cards.priority,
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
        isNull(cards.completedAt),
        isNull(projects.deletedAt),
        isNull(projects.archivedAt),
        lt(cards.dueAt, window.end),
        window.start ? gte(cards.dueAt, window.start) : undefined,
      ),
    )
    .orderBy(asc(cards.dueAt));

  return rawRows.map((r) => {
    const due = new Date(r.dueAt!);
    return {
      id: r.id,
      title: r.title,
      projectId: r.projectId,
      projectName: r.projectName,
      boardKind: r.boardKind,
      dueAt: due,
      overdue: r.isAllDay
        ? due.getTime() < today.start.getTime()
        : due.getTime() < now.getTime(),
      role: r.role,
      priority: normalizePriority(r.priority),
    };
  });
}

/**
 * Cheap count of open (not completed/deleted) cards due today or earlier,
 * across every project `userId` is a member of — the same overdue+due-today
 * window `loadDueCards` uses for Today's teaser, as a single `COUNT(*)`
 * instead of hydrating full rows. Powers the app badge (V2 S7); see
 * app/(app)/layout.tsx.
 */
export async function countDueOrOverdueCards(
  userId: string,
  today: DayWindow,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cards)
    .innerJoin(projects, eq(cards.projectId, projects.id))
    .innerJoin(
      memberships,
      and(eq(memberships.projectId, projects.id), eq(memberships.userId, userId)),
    )
    .where(
      and(
        isNull(cards.deletedAt),
        isNull(cards.completedAt),
        isNull(projects.deletedAt),
        isNull(projects.archivedAt),
        lt(cards.dueAt, today.end),
      ),
    );
  return row?.count ?? 0;
}
