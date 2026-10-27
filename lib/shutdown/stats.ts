import { localDateKey, shiftDateKey } from "@/lib/dates";

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

// Re-exported so existing imports from this module keep working — the
// single implementation lives in lib/dates.ts (V2 S6).
export { localDateKey, shiftDateKey };

export function consistencyStats(
  closedDates: string[],
  todayLocal: string,
  opts?: ConsistencyOptions,
): ConsistencyStats {
  const windowDays = opts?.windowDays ?? 7;
  const closed = new Set(closedDates);

  let closedInWindow = 0;
  for (let i = 0; i < windowDays; i++) {
    if (closed.has(shiftDateKey(todayLocal, -i))) closedInWindow++;
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
