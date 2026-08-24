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

export type LeftoverRow = {
  id: string;
  title: string;
  projectName: string;
  dueAt: Date;
  overdue: boolean;
};

function Leftover({ row }: { row: LeftoverRow }) {
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
    <li
      className={cn(
        "space-y-2.5 rounded-lg border border-border bg-surface p-3 transition-opacity",
        pending && "opacity-50",
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="h-5 w-5 shrink-0 rounded-full border border-border"
        />
        <span className="min-w-0 flex-1 truncate text-sm">{row.title}</span>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
          {row.projectName}
        </span>
        {row.overdue && (
          <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium bg-danger/15 text-danger">
            Overdue
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => {
            setGone(true);
            run(postponeCardToTomorrow, "Moved to tomorrow");
          }}
          disabled={pending}
          aria-label={`Move ${row.title} to tomorrow`}
          className="min-h-[44px] rounded-md border border-border bg-surface-2 px-2 py-2 text-xs font-medium transition-colors hover:bg-surface disabled:opacity-50"
        >
          → tmrw
        </button>
        <button
          onClick={() => {
            setGone(true);
            run(completeCardNow, "Done — nice.");
          }}
          disabled={pending}
          aria-label={`Complete ${row.title}`}
          className="min-h-[44px] rounded-md border border-emerald-600/40 bg-emerald-600/10 px-2 py-2 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-600/20 disabled:opacity-50"
        >
          ✓ done
        </button>
        <button
          onClick={() => {
            setGone(true);
            run(letGoOfCard, "Let go — no guilt.");
          }}
          disabled={pending}
          aria-label={`Let go of ${row.title}`}
          className="min-h-[44px] rounded-md border border-border bg-surface-2 px-2 py-2 text-xs font-medium text-muted transition-colors hover:bg-surface hover:text-text disabled:opacity-50"
        >
          let go
        </button>
      </div>
    </li>
  );
}

export function LeftoverList({ rows }: { rows: LeftoverRow[] }) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <Leftover key={row.id} row={row} />
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
