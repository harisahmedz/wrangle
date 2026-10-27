"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toggleCardComplete } from "@/lib/kanban/actions";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonStyles } from "@/components/ui/button";
import { TaskRow } from "@/components/tasks/task-row";
import { formatDueLabel } from "@/components/tasks/due-label";

export type TodayRow = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  boardKind: "todo" | "ideas" | "work";
  dueAt: Date;
  overdue: boolean;
};

function Row({ card, timeZone }: { card: TodayRow; timeZone: string }) {
  const [, startTransition] = useTransition();
  const router = useRouter();

  return (
    <TaskRow
      title={card.title}
      href={`/p/${card.projectId}/b/${card.boardKind}?card=${card.id}`}
      completed={false}
      onToggle={() => {
        const fd = new FormData();
        fd.set("cardId", card.id);
        // TODO(S8): toggleCardComplete flips server state; switch to a
        // `completed` SET once the action accepts it (OFFLINE-OUTBOX §9.2).
        startTransition(async () => {
          await toggleCardComplete(fd);
        });
      }}
      due={formatDueLabel(card.dueAt, card.overdue, timeZone)}
      // Today groups rows under a project header already — the tag would
      // be redundant here.
      onOpen={() => router.refresh()}
    />
  );
}

export function TodayList({
  rows,
  timeZone,
}: {
  rows: TodayRow[];
  timeZone: string;
}) {
  if (rows.length === 0) return null;
  return (
    <ul>
      {rows.map((c) => (
        <Row key={c.id} card={c} timeZone={timeZone} />
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
