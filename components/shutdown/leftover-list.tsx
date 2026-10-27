"use client";

import { useState, useTransition } from "react";
import {
  completeCardNow,
  letGoOfCard,
  postponeCardToTomorrow,
} from "@/lib/actions/shutdown";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/actions/types";
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

  if (gone) return null;

  return (
    <TaskRow
      title={row.title}
      href={`/p/${row.projectId}/b/${row.boardKind}?card=${row.id}`}
      completed={false}
      // Shutdown resolves leftovers with Tomorrow/Done/Let go, not a plain
      // checkbox toggle — the checkbox mirrors "Done" for a quick complete.
      onToggle={() => {
        setGone(true);
        run(completeCardNow, "Done. Nice.");
      }}
      due={formatDueLabel(row.dueAt, row.overdue, timeZone)}
      // Shutdown groups rows under a project header already — the tag
      // would be redundant here.
      trailing={
        <div
          className={cn(
            "grid grid-cols-3 gap-2 transition-opacity",
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
          <button
            onClick={() => {
              setGone(true);
              run(completeCardNow, "Done. Nice.");
            }}
            disabled={pending}
            aria-label={`Complete ${row.title}`}
            className="min-h-11 rounded-md border border-success/40 bg-success/10 px-2 py-2 text-xs font-medium text-success transition-colors hover:bg-success/20 disabled:opacity-50"
          >
            Done
          </button>
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
