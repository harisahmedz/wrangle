"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/dialog";
import { SlidersIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { GroupBy, SortMode, ViewLayout } from "@/lib/validation/prefs";

type Props = {
  layout: ViewLayout | null;
  groupBy?: GroupBy;
  sort?: SortMode;
  showCompleted?: boolean;
  /** Board ignores Group by/Sort/Show completed — hide them when Board is the resolved layout. */
  showListOptions?: boolean;
  /** Learn (V2 S4b) only offers the Board/List switch — no group/sort/show-completed section at all, not even the "switch to List" hint. */
  layoutOnly?: boolean;
  onLayoutChange: (layout: ViewLayout) => void;
  onGroupByChange?: (groupBy: GroupBy) => void;
  onSortChange?: (sort: SortMode) => void;
  onShowCompletedChange?: (showCompleted: boolean) => void;
};

/** Top-right "View" popover: Layout, Group by, Sort, Show completed (ROADMAP-V2 F1). */
export function ViewMenu({
  layout,
  groupBy,
  sort,
  showCompleted,
  showListOptions,
  layoutOnly,
  onLayoutChange,
  onGroupByChange,
  onSortChange,
  onShowCompletedChange,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex min-h-11 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-muted transition-colors hover:text-text"
      >
        <SlidersIcon className="h-4 w-4" />
        View
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} label="View options" className="sm:max-w-sm">
        <h3 className="mb-4 text-base font-semibold">View</h3>

        <div className="mb-4">
          <p className="mb-1.5 text-xs font-medium text-muted">Layout</p>
          <div className="inline-flex rounded-lg border border-border bg-surface-2 p-1" role="group" aria-label="Layout">
            {(["board", "list"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => onLayoutChange(v)}
                aria-pressed={layout === v}
                className={cn(
                  "min-h-11 rounded-md px-4 text-sm capitalize transition-colors",
                  layout === v ? "bg-accent text-accent-fg" : "text-muted hover:text-text",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {!layoutOnly &&
          (showListOptions ? (
            <>
              <label className="mb-4 block">
                <span className="mb-1.5 block text-xs font-medium text-muted">Group by</span>
                <select
                  value={groupBy}
                  onChange={(e) => onGroupByChange?.(e.target.value as GroupBy)}
                  className="h-11 w-full rounded-md border border-border bg-surface-2 px-3 text-sm"
                >
                  <option value="column">Column</option>
                  <option value="due">Due date</option>
                  <option value="none">None</option>
                </select>
              </label>

              <label className="mb-4 block">
                <span className="mb-1.5 block text-xs font-medium text-muted">Sort</span>
                <select
                  value={sort}
                  onChange={(e) => onSortChange?.(e.target.value as SortMode)}
                  className="h-11 w-full rounded-md border border-border bg-surface-2 px-3 text-sm"
                >
                  <option value="manual">Manual</option>
                  <option value="due">Due date</option>
                  <option value="priority">Priority</option>
                </select>
              </label>

              <label className="flex min-h-11 items-center justify-between gap-2 text-sm">
                Show completed
                <input
                  type="checkbox"
                  checked={showCompleted}
                  onChange={(e) => onShowCompletedChange?.(e.target.checked)}
                  className="h-5 w-5"
                />
              </label>
            </>
          ) : (
            <p className="text-xs text-muted">Switch Layout to List to group, sort, or show completed tasks.</p>
          ))}
      </Sheet>
    </>
  );
}
