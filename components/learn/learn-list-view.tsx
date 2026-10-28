"use client";

import { useTransition, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { TaskRow } from "@/components/tasks/task-row";
import { useToast } from "@/components/ui/toast";
import { mutate } from "@/lib/mutations";
import { useOutbox } from "@/lib/outbox/client";
import { syncStateOf } from "@/lib/outbox/overlay";
import { prevStatus } from "@/lib/learning/logic";
import { buildLearnListGroups, learnRowMeta } from "@/lib/learning/list-groups";
import type { LearnItemRow } from "@/components/learn/types";

const EMPTY_HINT: Record<LearnItemRow["status"], string> = {
  want: "Add something you want to learn",
  learning: "Move an item here when you start it",
  learned: "Finished items land here",
};

/**
 * Learn's List layout (V2 S4b, backlog B80): the same three statuses as
 * `LearnBoard`, rendered as `TaskRow` rows grouped under a header + count
 * instead of pipeline tiles. The checkbox is a set, not a toggle — it marks
 * an item learned (celebrating, like `PipelineCard`'s own "Mark learned")
 * or, from the Learned group, sends it back to Learning. No drag-to-reorder:
 * `lib/actions/learning.ts` has no reorder-within-status action yet.
 */
export function LearnListView({ items, viewMenu }: { items: LearnItemRow[]; viewMenu: ReactNode }) {
  const searchParams = useSearchParams();
  const pushToast = useToast();
  const [, startTransition] = useTransition();
  const { entries: outboxEntries } = useOutbox();

  const groups = buildLearnListGroups(items);

  const itemHref = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("item", id);
    return `/learn?${params.toString()}`;
  };

  const toggle = (item: LearnItemRow) => {
    const wasLearned = item.status === "learned";
    const status = wasLearned ? (prevStatus(item.status) ?? "learning") : "learned";

    startTransition(() => {
      mutate({ kind: "learning.setStatus", itemId: item.id, status }, `Mark “${item.title}” as ${status}`).then((res) => {
        if (!res.ok) pushToast({ message: res.error });
        else if (!wasLearned) pushToast({ message: `🎉 Learned: ${item.title}` });
      });
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">{viewMenu}</div>
      <div className="space-y-6">
        {groups.map((group) => (
          <section key={group.status}>
            <div className="mb-1 flex items-baseline gap-2 px-1">
              <h2 className="text-sm font-semibold">{group.label}</h2>
              <span className="text-xs tabular-nums text-muted">{group.items.length}</span>
            </div>
            {group.items.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
                {EMPTY_HINT[group.status]}
              </p>
            ) : (
              <ul>
                {group.items.map((item) => (
                  <TaskRow
                    key={item.id}
                    title={item.title}
                    href={itemHref(item.id)}
                    completed={item.status === "learned"}
                    onToggle={() => toggle(item)}
                    meta={learnRowMeta(item)}
                    sync={syncStateOf(item.id, outboxEntries) ?? undefined}
                  />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
