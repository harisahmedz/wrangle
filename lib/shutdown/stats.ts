const DAY_MS = 86_400_000;

export type ConsistencyStats = {
  closedLast7: number;
  consistencyRatePct: number;
  totalAllTime: number;
  missedYesterday: boolean;
  showNeverMissTwiceNudge: boolean;
};

export type ConsistencyOptions = {
  windowDays?: number;
};

function dateKeyMs(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function keyOfMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function shiftDateKey(key: string, offsetDays: number): string {
  return keyOfMs(dateKeyMs(key) + offsetDays * DAY_MS);
}

export function localDateKey(date: Date, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date);
}

export function consistencyStats(
  closedDates: string[],
  todayLocal: string,
  opts?: ConsistencyOptions,
): ConsistencyStats {
  const windowDays = opts?.windowDays ?? 7;
  const closed = new Set(closedDates);
  const todayMs = dateKeyMs(todayLocal);

  let closedInWindow = 0;
  for (let i = 0; i < windowDays; i++) {
    if (closed.has(keyOfMs(todayMs - i * DAY_MS))) closedInWindow++;
  }

  const missedYesterday = !closed.has(shiftDateKey(todayLocal, -1));

  return {
    closedLast7: closedInWindow,
    consistencyRatePct: Math.round((closedInWindow / windowDays) * 100),
    totalAllTime: closed.size,
    missedYesterday,
    showNeverMissTwiceNudge:
      missedYesterday && !closed.has(todayLocal),
  };
}

export function groupByProject<T extends { projectName: string }>(
  rows: T[],
): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const arr = map.get(row.projectName) ?? [];
    arr.push(row);
    map.set(row.projectName, arr);
  }
  return [...map.entries()];
}
