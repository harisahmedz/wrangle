const DAY_MS = 86_400_000;

type Parts = { y: number; m: number; d: number };

export function localDateParts(date: Date, timeZone: string): Parts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = fmt.format(date).split("-").map(Number);
  return { y, m, d };
}

/** The user's local calendar day for an instant, as "YYYY-MM-DD". The single
 * source for this — `lib/shutdown/stats.ts` re-exports it rather than
 * redefining it, so does `lib/kanban/upcoming.ts`. */
export function localDateKey(date: Date, timeZone: string): string {
  const { y, m, d } = localDateParts(date, timeZone);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function dateKeyMs(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function keyOfMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Shifts a "YYYY-MM-DD" day key by whole calendar days. Pure calendar
 * arithmetic on an already-resolved local day — no timezone involved. */
export function shiftDateKey(key: string, offsetDays: number): string {
  return keyOfMs(dateKeyMs(key) + offsetDays * DAY_MS);
}

type DateTimeParts = {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
  s: number;
};

function localDateTimeParts(date: Date, timeZone: string): DateTimeParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts: Record<string, number> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return {
    y: parts.year,
    m: parts.month,
    d: parts.day,
    h: parts.hour === 24 ? 0 : parts.hour,
    mi: parts.minute,
    s: parts.second,
  };
}

function wallToUtcMs(p: DateTimeParts): number {
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
}

function tzOffsetMs(instantMs: number, timeZone: string): number {
  const wall = wallToUtcMs(localDateTimeParts(new Date(instantMs), timeZone));
  return wall - instantMs;
}

function fromWall(
  y: number,
  m: number,
  d: number,
  timeZone: string,
): number {
  const naive = Date.UTC(y, m - 1, d);
  const pass1 = naive - tzOffsetMs(naive, timeZone);
  return naive - tzOffsetMs(pass1, timeZone);
}

export type DayWindow = { start: Date; end: Date };

export function localDayWindow(
  now: Date,
  timeZone: string,
  offsetDays = 0,
): DayWindow {
  const shifted = new Date(now.getTime() + offsetDays * DAY_MS);
  const { y, m, d } = localDateParts(shifted, timeZone);
  const startMs = fromWall(y, m, d, timeZone);
  return { start: new Date(startMs), end: new Date(startMs + DAY_MS) };
}

export function todayWindow(timeZone: string): DayWindow {
  return localDayWindow(new Date(), timeZone);
}

export function upcomingWindow(timeZone: string): DayWindow {
  return localDayWindow(new Date(), timeZone, 1);
}

/**
 * The local-day window for a specific calendar date (not relative to
 * "now") — used by Upcoming (V2 S6) to turn a `?from=YYYY-MM-DD` day key
 * into a DST-correct UTC instant. `end` is the start of the *next*
 * calendar date (via `fromWall` again), not `start + 24h` — on a DST
 * transition day the wall-clock day is 23 or 25 hours long, so a fixed
 * +24h offset lands on the wrong side of the transition.
 */
export function dayWindowForDate(
  y: number,
  m: number,
  d: number,
  timeZone: string,
): DayWindow {
  const startMs = fromWall(y, m, d, timeZone);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const endMs = fromWall(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    timeZone,
  );
  return { start: new Date(startMs), end: new Date(endMs) };
}

/** `dayWindowForDate` from a "YYYY-MM-DD" key instead of separate y/m/d. */
export function dayWindowForDateKey(key: string, timeZone: string): DayWindow {
  const [y, m, d] = key.split("-").map(Number);
  return dayWindowForDate(y, m, d, timeZone);
}
