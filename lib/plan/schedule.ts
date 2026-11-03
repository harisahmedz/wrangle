// Plan my week (V3 S6, backlog B93, ROADMAP-V3 §6): the deterministic
// scheduler. Code decides every date. The optional AI step
// (lib/ai/tasks/plan-focus.ts) only hands in `pinned` card ids, which get
// placed first. Pure: no clock, no DB, no browser globals — the caller
// supplies today's day key and the user's timezone (lib/dates.ts does the
// calendar math, HANDOFF rule #4).
//
// Rules, as built:
//   1. Candidates are ranked (priority P1→P4, overdue before the rest, then
//      oldest: due date, else created) and capped at 40 — the same order
//      lib/plan/candidates.ts uses in SQL, re-applied here so the scheduler
//      is correct on any input.
//   2. Cards due inside the 7-day horizon keep their day while that day has
//      room. Over the cap, the pinned cards and the best-ranked ones stay;
//      the rest move to the next day with room, never earlier than their
//      due day. With no room anywhere later, a card stays on its due day
//      (over cap) rather than leave the week — it is due.
//   3. Overdue and undated cards then fill from today onward: pinned first,
//      then rank order. What doesn't fit is left out of the plan (the UI
//      says so) and keeps its current state.
//   4. A timed card keeps its wall-clock time on the new day; an all-day
//      card stays all-day; an undated card becomes all-day on its new day.
import { instantAtLocalTime, localDateKey, localTimeOfDay, shiftDateKey } from "@/lib/dates";

/** A local calendar day, "YYYY-MM-DD" (same shape as lib/kanban/upcoming.ts's DayKey). */
type DayKey = string;

export const PLAN_HORIZON_DAYS = 7;
export const MAX_PLAN_CANDIDATES = 40;
/** Also the `users.prefs.plan` defaults in lib/validation/prefs.ts (`PLAN_CAP_DEFAULTS`); a unit test keeps them equal. */
export const DEFAULT_DAILY_CAP = 5;
export const DEFAULT_WEEKEND_CAP = 2;
/** All-day cards (and formerly undated ones) land at local noon, like Shutdown's "→ tomorrow" and the card detail sheet. */
export const ALL_DAY_HOUR = 12;

export type PlanCandidate = {
  id: string;
  /** Current due instant (ISO), or null for an undated card. */
  dueAt: string | null;
  isAllDay: boolean;
  /** 1|2|3|null — P4 is null (lib/kanban/priority.ts). */
  priority: 1 | 2 | 3 | null;
  /** ISO; the "oldest" tie-break for undated cards. */
  createdAt: string;
};

export type PlanOptions = {
  /** The user's local today, "YYYY-MM-DD". */
  todayKey: DayKey;
  timeZone: string;
  dailyCap?: number;
  weekendCap?: number;
  /** Card ids the AI step picked for the user's focus; placed first. Unknown ids are ignored. */
  pinned?: readonly string[];
};

export type PlanMove = {
  cardId: string;
  /** The card's current due instant (ISO) or null. */
  from: string | null;
  /** The proposed local day. */
  to: DayKey;
  /** True for a timed card: it keeps its time of day on `to`. */
  keepTime: boolean;
};

/** Saturday or Sunday in the proleptic Gregorian calendar — pure day-key math, no timezone. */
export function isWeekend(key: DayKey): boolean {
  const [y, m, d] = key.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
}

export function capForDay(key: DayKey, dailyCap: number, weekendCap: number): number {
  return Math.max(0, isWeekend(key) ? weekendCap : dailyCap);
}

/** The 7 day keys of the plan, today first. */
export function planDays(todayKey: DayKey): DayKey[] {
  return Array.from({ length: PLAN_HORIZON_DAYS }, (_, i) => shiftDateKey(todayKey, i));
}

function dayKeyOf(c: PlanCandidate, timeZone: string): DayKey | null {
  return c.dueAt ? localDateKey(new Date(c.dueAt), timeZone) : null;
}

/**
 * Priority P1→P4, overdue before everything else, then oldest (due date for
 * dated cards, created date for undated ones), then id. Total and
 * deterministic, so the input order never matters. Mirrors the ORDER BY in
 * lib/plan/candidates.ts.
 */
export function rankCandidates<T extends PlanCandidate>(
  candidates: readonly T[],
  todayKey: DayKey,
  timeZone: string,
): T[] {
  const keyed = candidates.map((c) => {
    const day = dayKeyOf(c, timeZone);
    return {
      c,
      priority: c.priority ?? 4,
      overdue: day !== null && day < todayKey ? 0 : 1,
      age: new Date(c.dueAt ?? c.createdAt).getTime(),
    };
  });
  keyed.sort(
    (a, b) =>
      a.priority - b.priority ||
      a.overdue - b.overdue ||
      a.age - b.age ||
      (a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0),
  );
  return keyed.map((k) => k.c);
}

/** Stable: pinned cards first, everything else in the order given. */
function pinnedFirst<T extends PlanCandidate>(list: readonly T[], pinned: ReadonlySet<string>): T[] {
  return [...list.filter((c) => pinned.has(c.id)), ...list.filter((c) => !pinned.has(c.id))];
}

/**
 * The plan: one move per placed card, in day order (today first), including
 * cards that stay on their day — compare with `isChange()` to find the ones
 * that actually move. Candidates that didn't fit are simply absent.
 */
export function scheduleWeek(input: readonly PlanCandidate[], opts: PlanOptions): PlanMove[] {
  const dailyCap = opts.dailyCap ?? DEFAULT_DAILY_CAP;
  const weekendCap = opts.weekendCap ?? DEFAULT_WEEKEND_CAP;
  const pinned = new Set(opts.pinned ?? []);
  const { todayKey, timeZone } = opts;

  const candidates = rankCandidates(input, todayKey, timeZone).slice(0, MAX_PLAN_CANDIDATES);
  const days = planDays(todayKey).map((key) => ({
    key,
    cap: capForDay(key, dailyCap, weekendCap),
    cards: [] as PlanCandidate[],
  }));
  const lastKey = days[days.length - 1].key;
  const indexOfDay = new Map(days.map((d, i) => [d.key, i]));
  const hasRoom = (i: number) => days[i].cards.length < days[i].cap;

  // Pass 1: cards due this week keep their day, up to the cap. Pinned first,
  // then rank order; the overflow is collected per day for pass 2.
  const spill: { c: PlanCandidate; fromIndex: number }[] = [];
  const dueThisWeek = candidates.filter((c) => {
    const day = dayKeyOf(c, timeZone);
    return day !== null && day >= todayKey && day <= lastKey;
  });
  for (const day of days) {
    const index = indexOfDay.get(day.key)!;
    const own = pinnedFirst(
      dueThisWeek.filter((c) => dayKeyOf(c, timeZone) === day.key),
      pinned,
    );
    for (const c of own) {
      if (hasRoom(index)) day.cards.push(c);
      else spill.push({ c, fromIndex: index });
    }
  }

  // Pass 2: spilled cards move to the next day with room, never earlier than
  // their due day. No room later in the week → stay on the due day, over cap.
  for (const { c, fromIndex } of spill) {
    let target = fromIndex;
    for (let i = fromIndex + 1; i < days.length; i++) {
      if (hasRoom(i)) {
        target = i;
        break;
      }
    }
    days[target].cards.push(c);
  }

  // Pass 3: overdue and undated cards fill from today: pinned first, then rank order.
  const fillers = pinnedFirst(
    candidates.filter((c) => {
      const day = dayKeyOf(c, timeZone);
      return day === null || day < todayKey;
    }),
    pinned,
  );
  for (const c of fillers) {
    const target = days.findIndex((_, i) => hasRoom(i));
    if (target === -1) continue; // doesn't fit this week
    days[target].cards.push(c);
  }

  return days.flatMap((day) =>
    day.cards.map((c) => ({
      cardId: c.id,
      from: c.dueAt,
      to: day.key,
      keepTime: c.dueAt !== null && !c.isAllDay,
    })),
  );
}

/** True when the move actually changes the card's day (or gives an undated card one). */
export function isChange(move: PlanMove, timeZone: string): boolean {
  return move.from === null || localDateKey(new Date(move.from), timeZone) !== move.to;
}

/**
 * The `card.update` patch for a move: a timed card keeps its wall-clock time
 * on the new day (DST-correct via lib/dates.ts); an all-day card lands at
 * local noon and stays all-day; an undated card becomes an all-day card.
 */
export function duePatchFor(
  move: PlanMove,
  timeZone: string,
): { dueAt: string; isAllDay?: boolean } {
  if (move.from === null) {
    return { dueAt: instantAtLocalTime(move.to, ALL_DAY_HOUR, 0, timeZone).toISOString(), isAllDay: true };
  }
  if (!move.keepTime) {
    return { dueAt: instantAtLocalTime(move.to, ALL_DAY_HOUR, 0, timeZone).toISOString() };
  }
  const { h, mi } = localTimeOfDay(new Date(move.from), timeZone);
  return { dueAt: instantAtLocalTime(move.to, h, mi, timeZone).toISOString() };
}
