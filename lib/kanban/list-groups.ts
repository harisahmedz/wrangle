import { localDayWindow } from "@/lib/dates";
import type { BoardCardData, BoardColumnData } from "@/lib/kanban/types";
import type { GroupBy, SortMode } from "@/lib/validation/prefs";

export type { GroupBy, SortMode } from "@/lib/validation/prefs";

export type ListGroup = {
  id: string;
  name: string;
  /** Target column for this group's inline add; null only if the board has no columns. */
  columnId: string | null;
  cards: BoardCardData[];
};

const DAY_MS = 86_400_000;

function sortCards(cards: BoardCardData[], sort: SortMode): BoardCardData[] {
  const copy = [...cards];
  if (sort === "due") {
    copy.sort((a, b) => {
      if (a.dueAt === null && b.dueAt === null) {
        return a.position < b.position ? -1 : a.position > b.position ? 1 : 0;
      }
      if (a.dueAt === null) return 1;
      if (b.dueAt === null) return -1;
      if (a.dueAt === b.dueAt) return 0;
      return a.dueAt < b.dueAt ? -1 : 1;
    });
  } else if (sort === "priority") {
    // P1 first, nulls (no priority / P4) last, manual position as the
    // tie-break within the same priority (ROADMAP-V2 S9).
    copy.sort((a, b) => {
      if (a.priority === b.priority) {
        return a.position < b.position ? -1 : a.position > b.position ? 1 : 0;
      }
      if (a.priority === null) return 1;
      if (b.priority === null) return -1;
      return a.priority - b.priority;
    });
  } else {
    copy.sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
  }
  return copy;
}

/**
 * Pure grouping/sorting for List view (ROADMAP-V2 F2). `now` is injectable
 * for tests; the caller leaves it at the default in real use. `timeZone`
 * (the caller's `users.timezone`) decides the "today" boundary via
 * `localDayWindow`, the same helper Today/Shutdown use, so SSR and CSR
 * agree on the same local day regardless of the server's or browser's own
 * clock timezone.
 *
 * Due-date buckets are date-only (unlike the board's `due=overdue` filter,
 * which also excludes completed cards) — a completed card keeps the bucket
 * its due date puts it in, and its row shows its own done/strikethrough state.
 */
export function buildListGroups(
  cards: BoardCardData[],
  columns: BoardColumnData[],
  groupBy: GroupBy,
  sort: SortMode,
  timeZone: string,
  now: Date = new Date(),
): ListGroup[] {
  const fallbackColumnId = columns.find((c) => !c.isDone)?.id ?? columns[0]?.id ?? null;

  if (groupBy === "none") {
    return [{ id: "all", name: "All tasks", columnId: fallbackColumnId, cards: sortCards(cards, sort) }];
  }

  if (groupBy === "due") {
    const todayStart = localDayWindow(now, timeZone).start.getTime();
    const buckets: Record<"overdue" | "today" | "upcoming" | "none", BoardCardData[]> = {
      overdue: [],
      today: [],
      upcoming: [],
      none: [],
    };
    for (const card of cards) {
      if (!card.dueAt) {
        buckets.none.push(card);
        continue;
      }
      const t = new Date(card.dueAt).getTime();
      if (t < todayStart) buckets.overdue.push(card);
      else if (t < todayStart + DAY_MS) buckets.today.push(card);
      else buckets.upcoming.push(card);
    }
    return [
      { id: "overdue", name: "Overdue", columnId: fallbackColumnId, cards: sortCards(buckets.overdue, sort) },
      { id: "today", name: "Today", columnId: fallbackColumnId, cards: sortCards(buckets.today, sort) },
      { id: "upcoming", name: "Upcoming", columnId: fallbackColumnId, cards: sortCards(buckets.upcoming, sort) },
      { id: "none", name: "No date", columnId: fallbackColumnId, cards: sortCards(buckets.none, sort) },
    ];
  }

  // groupBy === "column" (default, D2)
  return columns.map((col) => ({
    id: col.id,
    name: col.name,
    columnId: col.id,
    cards: sortCards(
      cards.filter((c) => c.columnId === col.id),
      sort,
    ),
  }));
}

/** Drag-to-reorder is only unambiguous when grouping by column with manual order. */
export function reorderEnabledFor(groupBy: GroupBy, sort: SortMode): boolean {
  return groupBy === "column" && sort === "manual";
}
