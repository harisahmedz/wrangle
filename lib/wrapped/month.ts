import { localDateParts } from "@/lib/dates";

const DAY_MS = 86_400_000;

export type MonthParts = { year: number; monthIndex: number };

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

function tzOffsetMs(instantMs: number, timeZone: string): number {
  const p = localDateTimeParts(new Date(instantMs), timeZone);
  const wall = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return wall - instantMs;
}

function fromWall(
  y: number,
  monthIndex: number,
  d: number,
  timeZone: string,
): number {
  const naive = Date.UTC(y, monthIndex, d);
  const pass1 = naive - tzOffsetMs(naive, timeZone);
  return naive - tzOffsetMs(pass1, timeZone);
}

export function currentMonthParts(now: Date, timeZone: string): MonthParts {
  const { y, m } = localDateParts(now, timeZone);
  return { year: y, monthIndex: m - 1 };
}

export function shiftMonth(
  year: number,
  monthIndex: number,
  delta: number,
): MonthParts {
  const d = new Date(Date.UTC(year, monthIndex + delta, 1));
  return { year: d.getUTCFullYear(), monthIndex: d.getUTCMonth() };
}

export function formatYearMonth(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export function parseMonthKey(key: string): MonthParts | null {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return { year, monthIndex };
}

export function isAfterMonth(a: MonthParts, b: MonthParts): boolean {
  return (
    a.year > b.year || (a.year === b.year && a.monthIndex > b.monthIndex)
  );
}

export function monthWindow(
  now: Date,
  timeZone: string,
  year: number,
  monthIndex: number,
): { start: Date; end: Date } {
  void now;
  const startMs = fromWall(year, monthIndex, 1, timeZone);
  const next = shiftMonth(year, monthIndex, 1);
  const endMs = fromWall(next.year, next.monthIndex, 1, timeZone);
  return { start: new Date(startMs), end: new Date(endMs) };
}

export function localDateStrings(
  start: Date,
  end: Date,
  timeZone: string,
): string[] {
  const out: string[] = [];
  let { y, m, d } = localDateParts(start, timeZone);
  for (;;) {
    const instant = fromWall(y, m - 1, d, timeZone);
    if (instant >= end.getTime()) break;
    out.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    const next = localDateParts(new Date(instant + DAY_MS), timeZone);
    y = next.y;
    m = next.m;
    d = next.d;
  }
  return out;
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function monthLabelFromParts(year: number, monthIndex: number): string {
  return new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
