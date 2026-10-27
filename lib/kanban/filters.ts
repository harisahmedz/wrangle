import { localDayWindow } from "@/lib/dates";
import type { BoardCardData, BoardFilters, DueFilter } from "@/lib/kanban/types";

const DAY_MS = 86_400_000;

/**
 * Shared board-filter predicates (extracted from `board-view.tsx` in V2 S4
 * so `ListView` can apply the same `?q=&label=&assignee=&due=` filters).
 *
 * `timeZone` (the caller's `users.timezone`) decides the "today" boundary
 * via `localDayWindow` so SSR (server/UTC clock) and CSR (browser clock)
 * agree on the same local day instead of drifting by the server/client's
 * own timezone offset (the earlier `new Date().getFullYear()/.../getDate()`
 * version used whichever machine ran it).
 */
export function matchesDue(card: BoardCardData, due: DueFilter | null, timeZone: string): boolean {
  if (!due) return true;
  if (due === "none") return card.dueAt === null;
  if (!card.dueAt) return false;
  const t = new Date(card.dueAt).getTime();
  const todayStart = localDayWindow(new Date(), timeZone).start.getTime();
  if (due === "overdue") return t < todayStart && card.completedAt === null;
  if (due === "today") return t < todayStart + DAY_MS;
  return t < todayStart + 8 * DAY_MS;
}

export function passesFilters(card: BoardCardData, f: BoardFilters, timeZone: string): boolean {
  if (f.q) {
    const q = f.q.toLowerCase();
    if (!card.title.toLowerCase().includes(q)) {
      return false;
    }
  }
  if (f.labelIds.length > 0 && !f.labelIds.some((id) => card.labelIds.includes(id))) {
    return false;
  }
  if (
    f.assigneeIds.length > 0 &&
    !f.assigneeIds.some((id) => card.assigneeIds.includes(id))
  ) {
    return false;
  }
  return matchesDue(card, f.due, timeZone);
}
