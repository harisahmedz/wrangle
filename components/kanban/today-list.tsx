"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toggleCardComplete } from "@/lib/kanban/actions";
import { cn } from "@/lib/utils";
import { CheckIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonStyles } from "@/components/ui/button";

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
        className="group/done -m-3 flex h-11 w-11 shrink-0 items-center justify-center"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border text-muted transition-colors group-hover/done:border-success group-hover/done:bg-success group-hover/done:text-accent-fg">
          <CheckIcon className="h-3 w-3" />
        </span>
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
    <EmptyState
      icon="🌤️"
      title="Nothing due today"
      description="Cards due today or overdue from any project land here. Give a card a due date and it shows up tomorrow morning."
      action={
        <Link href="/boards" className={buttonStyles({ variant: "secondary", size: "sm" })}>
          Open your boards
        </Link>
      }
    />
  );
}
