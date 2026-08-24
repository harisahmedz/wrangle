"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toggleCardComplete } from "@/lib/kanban/actions";
import { cn } from "@/lib/utils";

export type TodayRow = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  boardKind: "todo" | "ideas" | "work";
  dueAt: Date;
  overdue: boolean;
};

function Row({ card }: { card: TodayRow }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  return (
    <li className="group flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
      <button
        onClick={() => {
          const fd = new FormData();
          fd.set("cardId", card.id);
          startTransition(async () => {
            await toggleCardComplete(fd);
          });
        }}
        aria-label={`Complete ${card.title}`}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px] transition-colors hover:border-emerald-500 hover:bg-emerald-500 hover:text-white"
      >
        ✓
      </button>
      <Link
        href={`/p/${card.projectId}/b/${card.boardKind}?card=${card.id}`}
        onClick={() => router.refresh()}
        className="min-w-0 flex-1 truncate text-sm"
      >
        {card.title}
      </Link>
      <span
        className={cn(
          "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium",
          card.overdue ? "bg-danger/15 text-danger" : "bg-surface-2 text-muted",
        )}
      >
        {card.dueAt.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })}
      </span>
      <Link
        href={`/p/${card.projectId}/b/${card.boardKind}`}
        className="hidden shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted hover:text-text sm:flex"
      >
        <span aria-hidden>{card.boardKind === "work" ? "🛠" : card.boardKind === "ideas" ? "💡" : "📋"}</span>
        {card.projectName}
      </Link>
    </li>
  );
}

export function TodayList({ rows }: { rows: TodayRow[] }) {
  if (rows.length === 0) return null;
  return (
    <ul className="space-y-2">
      {rows.map((c) => (
        <Row key={c.id} card={c} />
      ))}
    </ul>
  );
}

export function EmptyToday() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface/50 px-6 py-14 text-center">
      <span className="text-4xl opacity-70">🌤️</span>
      <p className="font-medium">Nothing due today</p>
      <p className="max-w-sm text-sm text-muted">
        Cards due today or overdue from all your projects land here — the screen
        to open first every morning.
      </p>
    </div>
  );
}
