"use client";

import type { ReactNode } from "react";
import { PipelineCard } from "@/components/learn/pipeline-card";
import type { LearnItemRow } from "@/components/learn/types";

const COLUMNS: Array<{
  status: LearnItemRow["status"];
  label: string;
  hint: string;
  empty: string;
}> = [
  {
    status: "want",
    label: "Want to learn",
    hint: "The backlog of curiosity",
    empty: "Add something you want to learn",
  },
  {
    status: "learning",
    label: "Learning",
    hint: "In progress now",
    empty: "Move an item here when you start it",
  },
  {
    status: "learned",
    label: "Learned",
    hint: "Finished & celebrated",
    empty: "Finished items land here",
  },
];

/**
 * The pre-S4b pipeline board, unchanged visually — now the "Board" half of
 * the Board/List switch (V2 S4b, backlog B80). Extracted from
 * `app/(app)/learn/page.tsx` so `LearnSwitcher` can pick between this and
 * `LearnListView`.
 */
export function LearnBoard({ items, viewMenu }: { items: LearnItemRow[]; viewMenu: ReactNode }) {
  const grouped = new Map<string, LearnItemRow[]>();
  for (const col of COLUMNS) grouped.set(col.status, []);
  for (const item of items) grouped.get(item.status)?.push(item);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">{viewMenu}</div>
      <div className="-mx-4 grid snap-x snap-mandatory grid-flow-col auto-cols-[88%] gap-4 overflow-x-auto px-4 pb-2 sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-3 sm:snap-none md:-mx-8 md:px-8">
        {COLUMNS.map((col) => (
          <section key={col.status} className="min-w-0 snap-start space-y-2.5 rounded-xl border border-border bg-surface p-2.5">
            <div className="flex items-baseline justify-between px-1">
              <h2 className="text-sm font-semibold">{col.label}</h2>
              <span className="text-xs tabular-nums text-muted">
                {grouped.get(col.status)?.length ?? 0}
              </span>
            </div>
            <p className="px-1 text-xs text-muted">{col.hint}</p>
            <div className="space-y-2">
              {(grouped.get(col.status) ?? []).map((item) => (
                <PipelineCard key={item.id} item={item} />
              ))}
              {(grouped.get(col.status) ?? []).length === 0 && (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
                  {col.empty}
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
