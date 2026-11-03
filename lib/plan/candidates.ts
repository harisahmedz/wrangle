import { and, asc, eq, exists, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { boards, cardAssignees, cards, memberships, projects } from "@/db/schema";
import type { BoardKind } from "@/db/schema";
import { dayWindowForDateKey, localDateKey, shiftDateKey, type DayWindow } from "@/lib/dates";
import { normalizePriority } from "@/lib/kanban/priority";
import { MAX_PLAN_CANDIDATES, PLAN_HORIZON_DAYS } from "@/lib/plan/schedule";
import type { PlanInput } from "@/lib/plan/types";
import { parseUserPrefs, PLAN_CAP_DEFAULTS } from "@/lib/validation/prefs";

export type PlanCandidateRow = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  boardKind: BoardKind;
  dueAt: Date | null;
  isAllDay: boolean;
  priority: 1 | 2 | 3 | null;
  createdAt: Date;
};

/**
 * Plan my week's candidates (V3 S6, ROADMAP-V3 §6): open cards on `todo`/
 * `work` boards of live projects where `userId` is a member **and not a
 * viewer** (a viewer's `card.update` would fail the apply layer, HANDOFF
 * rule #3), that are either due before `horizonEnd` (overdue + the next 7
 * days) or undated and assigned to the user or in My Space. Ordered by
 * priority, then overdue first, then oldest (due date, else created) — the
 * same ranking `rankCandidates()` in lib/plan/schedule.ts applies — and
 * capped at 40.
 *
 * Plain module, like `loadDueCards`: takes a trusted `userId`, so call it
 * only after an authz check (the `loadPlanInput` Server Action).
 */
export async function loadPlanCandidates(
  userId: string,
  todayStart: Date,
  horizonEnd: Date,
): Promise<PlanCandidateRow[]> {
  const assignedToMe = exists(
    db
      .select({ one: sql`1` })
      .from(cardAssignees)
      .where(and(eq(cardAssignees.cardId, cards.id), eq(cardAssignees.userId, userId))),
  );

  const rows = await db
    .select({
      id: cards.id,
      title: cards.title,
      projectId: projects.id,
      projectName: projects.name,
      boardKind: boards.kind,
      dueAt: cards.dueAt,
      isAllDay: cards.isAllDay,
      priority: cards.priority,
      createdAt: cards.createdAt,
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
        inArray(boards.kind, ["todo", "work"]),
        ne(memberships.role, "viewer"),
        or(
          lt(cards.dueAt, horizonEnd),
          and(isNull(cards.dueAt), or(eq(projects.isPersonal, true), assignedToMe)),
        ),
      ),
    )
    .orderBy(
      sql`coalesce(${cards.priority}, 4)`,
      sql`case when ${cards.dueAt} < ${todayStart.toISOString()}::timestamptz then 0 else 1 end`,
      sql`coalesce(${cards.dueAt}, ${cards.createdAt})`,
      asc(cards.id),
    )
    .limit(MAX_PLAN_CANDIDATES);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    projectId: r.projectId,
    projectName: r.projectName,
    boardKind: r.boardKind,
    dueAt: r.dueAt ? new Date(r.dueAt) : null,
    isAllDay: r.isAllDay,
    priority: normalizePriority(r.priority),
    createdAt: new Date(r.createdAt),
  }));
}

/**
 * Everything the Plan my week sheet needs, assembled by the Upcoming page
 * (after `requireUser()`) and passed down as props. Server-rendered on
 * purpose rather than fetched when the sheet opens: the page is cached by
 * the service worker, so the scheduler still works offline (ROADMAP-V3 §8);
 * only the AI step needs a connection. `today` is the page's own
 * `todayWindow(timeZone)` so the request has one "now" (as `loadDueCards`).
 */
export async function loadPlanInput(
  userId: string,
  timeZone: string,
  today: DayWindow,
  prefsRaw: unknown,
): Promise<PlanInput> {
  const todayKey = localDateKey(today.start, timeZone);
  // Exclusive: the start of the day after the 7-day horizon.
  const horizonEnd = dayWindowForDateKey(shiftDateKey(todayKey, PLAN_HORIZON_DAYS), timeZone).start;
  const rows = await loadPlanCandidates(userId, today.start, horizonEnd);
  const plan = parseUserPrefs(prefsRaw).plan;
  return {
    timeZone,
    todayKey,
    dailyCap: plan?.dailyCap ?? PLAN_CAP_DEFAULTS.dailyCap,
    weekendCap: plan?.weekendCap ?? PLAN_CAP_DEFAULTS.weekendCap,
    candidates: rows.map((r) => ({
      id: r.id,
      title: r.title,
      projectId: r.projectId,
      projectName: r.projectName,
      boardKind: r.boardKind,
      dueAt: r.dueAt ? r.dueAt.toISOString() : null,
      isAllDay: r.isAllDay,
      priority: r.priority,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
