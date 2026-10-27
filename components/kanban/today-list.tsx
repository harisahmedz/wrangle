"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonStyles } from "@/components/ui/button";
import { DueCardRow } from "@/components/tasks/due-card-row";
import type { DueCardRow as DueCardRowData } from "@/lib/kanban/due-cards";

export type TodayRow = DueCardRowData;

function Row({
  card,
  timeZone,
  showProject,
}: {
  card: TodayRow;
  timeZone: string;
  showProject?: boolean;
}) {
  const router = useRouter();
  return (
    <DueCardRow
      card={card}
      timeZone={timeZone}
      // The grouped "Due today & overdue" sections pass nothing here (a
      // project header already does the job); the "Next up" teaser passes
      // `showProject` since it mixes projects without a grouping header.
      showProject={showProject}
      onOpen={() => router.refresh()}
    />
  );
}

export function TodayList({
  rows,
  timeZone,
  showProject,
}: {
  rows: TodayRow[];
  timeZone: string;
  showProject?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <ul>
      {rows.map((c) => (
        <Row key={c.id} card={c} timeZone={timeZone} showProject={showProject} />
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
