import { z } from "zod";
import { localDateKey, shiftDateKey } from "@/lib/dates";
import type { DueCardRow } from "@/lib/kanban/due-cards";

/** A local calendar day, "YYYY-MM-DD", already resolved for a timezone. */
export type DayKey = string;

const MAX_OFFSET_DAYS = 365;
const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function partsOf(key: DayKey): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

/** True only for a key that round-trips through the calendar, e.g. rejects "2026-02-30". */
function isRealDate(key: DayKey): boolean {
  const { y, m, d } = partsOf(key);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/**
 * Validates `?from=` (zod) and clamps it to +/-1 year of `todayKey` so a
 * crafted URL can't push the agenda query an absurd distance out. Falls
 * back to `todayKey` for anything malformed or not a real calendar date.
 * Day keys are zero-padded "YYYY-MM-DD", so plain string comparison sorts
 * them chronologically — no numeric day-offset math needed here.
 */
export function resolveFromParam(
  raw: string | undefined,
  todayKey: DayKey,
): DayKey {
  const parsed = dateKeySchema.safeParse(raw);
  if (!parsed.success || !isRealDate(parsed.data)) return todayKey;
  const minKey = shiftDateKey(todayKey, -MAX_OFFSET_DAYS);
  const maxKey = shiftDateKey(todayKey, MAX_OFFSET_DAYS);
  if (parsed.data < minKey) return minKey;
  if (parsed.data > maxKey) return maxKey;
  return parsed.data;
}

/** "Thu 29 Oct" — weekday, day, short month, no year (matches ROADMAP-V2 S6 reference). */
function formatDayMonth(key: DayKey): string {
  const { y, m, d } = partsOf(key);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "UTC",
  }).format(date);
  const month = new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  }).format(date);
  return `${weekday} ${d} ${month}`;
}

/** Short weekday label for the week-strip pill, e.g. "Mon". */
export function weekdayShortLabel(key: DayKey): string {
  const { y, m, d } = partsOf(key);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "Today" / "Tomorrow" / "Thu 29 Oct" — always relative to the real today. */
export function dayHeaderLabel(key: DayKey, todayKey: DayKey): string {
  if (key === todayKey) return "Today";
  if (key === shiftDateKey(todayKey, 1)) return "Tomorrow";
  return formatDayMonth(key);
}

/** "October 2026" for the PageHeader subtitle. */
export function monthLabel(key: DayKey): string {
  const { y, m, d } = partsOf(key);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export type DayGroup = { key: DayKey; label: string; rows: DueCardRow[] };

/**
 * Buckets `rows` (already fetched for the right window, see
 * `lib/kanban/due-cards.ts`) into an "Overdue" pile plus one group per day
 * from `fromKey` for `numDays` days, dropping days with no cards.
 * `includeOverdue` should only be true when `fromKey === todayKey` — a
 * future/past week has no "overdue" concept of its own.
 */
export function groupUpcomingRows(
  rows: DueCardRow[],
  timeZone: string,
  opts: { fromKey: DayKey; todayKey: DayKey; numDays: number; includeOverdue: boolean },
): { overdue: DueCardRow[]; days: DayGroup[] } {
  const dayKeys = Array.from({ length: opts.numDays }, (_, i) =>
    shiftDateKey(opts.fromKey, i),
  );
  const buckets = new Map<DayKey, DueCardRow[]>(dayKeys.map((k) => [k, []]));

  const overdue: DueCardRow[] = [];
  for (const row of rows) {
    const key = localDateKey(row.dueAt, timeZone);
    if (opts.includeOverdue && key < opts.fromKey) {
      overdue.push(row);
      continue;
    }
    buckets.get(key)?.push(row);
  }

  const days: DayGroup[] = [];
  for (const [key, bucketRows] of buckets) {
    if (bucketRows.length === 0) continue;
    days.push({ key, label: dayHeaderLabel(key, opts.todayKey), rows: bucketRows });
  }

  return { overdue, days };
}

export type WeekStripDay = {
  key: DayKey;
  weekday: string;
  date: number;
  isToday: boolean;
  hasCards: boolean;
};

/** The 7 pills for the week strip, starting at `fromKey`. */
export function weekStripDays(
  fromKey: DayKey,
  todayKey: DayKey,
  cardDayKeys: ReadonlySet<DayKey>,
): WeekStripDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const key = shiftDateKey(fromKey, i);
    return {
      key,
      weekday: weekdayShortLabel(key),
      date: partsOf(key).d,
      isToday: key === todayKey,
      hasCards: cardDayKeys.has(key),
    };
  });
}
