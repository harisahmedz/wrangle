"use client";

import { useState, useTransition } from "react";
import {
  letGoOfCard,
  postponeCardToTomorrow,
} from "@/lib/actions/shutdown";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/actions/types";
import type { ProjectRole } from "@/db/schema";
import { mutate } from "@/lib/mutations";
import { cn } from "@/lib/utils";
import { TaskRow } from "@/components/tasks/task-row";
import { formatDueLabel } from "@/components/tasks/due-label";

export type LeftoverRow = {
  id: string;
  title: string;
  projectId: string;
  boardKind: "todo" | "ideas" | "work";
  projectName: string;
  dueAt: Date;
  overdue: boolean;
  /** The user's role on the card's project: a `viewer` can't complete it
   * (the queued `card.complete` needs "member"+), so the checkbox and the
   * Done button are withheld rather than queuing an entry that will fail. */
  role: ProjectRole;
};

function Leftover({ row, timeZone }: { row: LeftoverRow; timeZone: string }) {
  const pushToast = useToast();
  const [gone, setGone] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = (
    action: (fd: FormData) => Promise<ActionResult>,
    message: string,
  ) => {
    const fd = new FormData();
    fd.set("cardId", row.id);
    startTransition(async () => {
      const res = await action(fd);
      if (!res.ok) {
        setGone(false);
        pushToast({ message: res.error });
        return;
      }
      pushToast({ message });
    });
  };

  // "Done" is the one queued verb here (OFFLINE-OUTBOX §1: `card.complete`);
  // Tomorrow/Let go stay online-only Server Actions (Q11).
  const complete = () => {
    setGone(true);
    startTransition(async () => {
      const res = await mutate(
        { kind: "card.complete", cardId: row.id, completed: true },
        `Complete “${row.title}”`,
      );
      if (!res.ok) {
        setGone(false);
        pushToast({ message: res.error });
        return;
      }
      pushToast({ message: "Done. Nice." });
    });
  };

  const canComplete = row.role !== "viewer";

  if (gone) return null;

  return (
    <TaskRow
      title={row.title}
      href={`/p/${row.projectId}/b/${row.boardKind}?card=${row.id}`}
      completed={false}
      // Shutdown resolves leftovers with Tomorrow/Done/Let go, not a plain
      // checkbox toggle — the checkbox mirrors "Done" for a quick complete.
      onToggle={canComplete ? complete : undefined}
      due={formatDueLabel(row.dueAt, row.overdue, timeZone)}
      // Shutdown groups rows under a project header already — the tag
      // would be redundant here.
      trailing={
        <div
          className={cn(
            "grid gap-2 transition-opacity",
            canComplete ? "grid-cols-3" : "grid-cols-2",
            pending && "opacity-50",
          )}
        >
          <button
            onClick={() => {
              setGone(true);
              run(postponeCardToTomorrow, "Moved to tomorrow");
            }}
            disabled={pending}
            aria-label={`Move ${row.title} to tomorrow`}
            className="min-h-11 rounded-md border border-border bg-surface-2 px-2 py-2 text-xs font-medium transition-colors hover:bg-surface disabled:opacity-50"
          >
            Tomorrow
          </button>
          {canComplete && <button
            onClick={complete}
            disabled={pending}
            aria-label={`Complete ${row.title}`}
            className="min-h-11 rounded-md border border-success/40 bg-success/10 px-2 py-2 text-xs font-medium text-success transition-colors hover:bg-success/20 disabled:opacity-50"
          >
            Done
          </button>}
          <button
            onClick={() => {
              setGone(true);
              run(letGoOfCard, "Let go. No guilt.");
            }}
            disabled={pending}
            aria-label={`Let go of ${row.title}`}
            className="min-h-11 rounded-md border border-border bg-surface-2 px-2 py-2 text-xs font-medium text-muted transition-colors hover:bg-surface hover:text-text disabled:opacity-50"
          >
            Let go
          </button>
        </div>
      }
    />
  );
}

export function LeftoverList({
  rows,
  timeZone,
}: {
  rows: LeftoverRow[];
  timeZone: string;
}) {
  return (
    <ul>
      {rows.map((row) => (
        <Leftover key={row.id} row={row} timeZone={timeZone} />
      ))}
    </ul>
  );
}

export function EmptyLeftovers() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface/50 px-4 py-6 text-center">
      <p className="text-sm font-medium">Nothing left from today.</p>
      <p className="mt-1 text-xs text-muted">Enjoy the evening.</p>
    </div>
  );
}
