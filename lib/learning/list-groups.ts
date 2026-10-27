import type { LearnItemRow } from "@/components/learn/types";
import { STATUS_ORDER, TYPE_META } from "@/lib/learning/logic";

export type LearnListGroup = {
  status: LearnItemRow["status"];
  label: string;
  items: LearnItemRow[];
};

const GROUP_LABEL: Record<LearnItemRow["status"], string> = {
  want: "Want",
  learning: "Learning",
  learned: "Learned",
};

/**
 * Groups Learn items by status, want/learning/learned order, for the List
 * view (V2 S4b, backlog B80). Items keep the server's `position` order
 * within each group — no reorder action exists yet for learning items
 * (`lib/actions/learning.ts` only moves an item *between* statuses), so the
 * list view doesn't offer drag-to-reorder.
 */
export function buildLearnListGroups(items: LearnItemRow[]): LearnListGroup[] {
  return STATUS_ORDER.map((status) => ({
    status,
    label: GROUP_LABEL[status],
    items: items.filter((item) => item.status === status),
  }));
}

/** "Oct 30" from a `YYYY-MM-DD` target date — UTC-pinned to match `PipelineCard`'s own formatting so Board and List agree. */
export function formatTargetDate(targetDate: string): string {
  return new Date(`${targetDate}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * TaskRow meta line for a Learn list row: type (emoji + label), progress %
 * while `learning` only (hidden for `want`, and for `learned`, where marking
 * done never bumps `progressPct` so it could read 0%), and the target date.
 */
export function learnRowMeta(item: LearnItemRow): string {
  const type = TYPE_META[item.type] ?? TYPE_META.other;
  const parts = [`${type.emoji} ${type.label}`];
  if (item.status === "learning") parts.push(`${item.progressPct}%`);
  if (item.targetDate) parts.push(`Target ${formatTargetDate(item.targetDate)}`);
  return parts.join(" · ");
}
