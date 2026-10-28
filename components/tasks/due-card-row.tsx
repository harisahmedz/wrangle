"use client";

import { useTransition } from "react";
import { toggleCardComplete } from "@/lib/kanban/actions";
import { TaskRow } from "@/components/tasks/task-row";
import { formatDueLabel } from "@/components/tasks/due-label";
import type { DueCardRow as DueCardRowData } from "@/lib/kanban/due-cards";

/**
 * Shared `TaskRow` wrapper for a due card — the toggle/link plumbing used
 * by both Today and Upcoming (V2 S6). `onOpen` is passed through as-is
 * (`TaskRow` stays refresh-agnostic); Today's list passes
 * `() => router.refresh()`, Upcoming doesn't need it.
 */
export function DueCardRow({
  card,
  timeZone,
  showProject,
  onOpen,
}: {
  card: DueCardRowData;
  timeZone: string;
  showProject?: boolean;
  onOpen?: () => void;
}) {
  const [, startTransition] = useTransition();
  // toggleCardComplete requires "member"+ — a viewer's checkbox would hit
  // requireMembership's notFound(). Render it non-interactive instead.
  const canToggle = card.role !== "viewer";

  return (
    <TaskRow
      title={card.title}
      href={`/p/${card.projectId}/b/${card.boardKind}?card=${card.id}`}
      completed={false}
      onToggle={
        canToggle
          ? () => {
              const fd = new FormData();
              fd.set("cardId", card.id);
              // TODO(S8): toggleCardComplete flips server state; switch to a
              // `completed` SET once the action accepts it (OFFLINE-OUTBOX §9.2).
              startTransition(async () => {
                await toggleCardComplete(fd);
              });
            }
          : undefined
      }
      priority={card.priority}
      due={formatDueLabel(card.dueAt, card.overdue, timeZone)}
      project={
        showProject
          ? { name: card.projectName, href: `/p/${card.projectId}` }
          : undefined
      }
      showProjectOnPhone={showProject}
      onOpen={onOpen}
    />
  );
}
