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
