"use client";

import { TaskRow } from "@/components/tasks/task-row";
import { formatDueLabel } from "@/components/tasks/due-label";
import type { DueCardRow as DueCardRowData } from "@/lib/kanban/due-cards";
import { mutate } from "@/lib/mutations";
import { useOutbox } from "@/lib/outbox/client";
import { completionOf, syncStateOf } from "@/lib/outbox/overlay";

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
  // `card.complete` needs "member"+ — a viewer's tick would come back as a
  // failed outbox entry. Render it non-interactive instead.
  const canToggle = card.role !== "viewer";
  // The server list only has open cards; a queued complete shows as done
  // here until the post-drain refresh drops the row (OFFLINE-OUTBOX §2.3).
  const { entries: outboxEntries } = useOutbox();
  const completed = completionOf(card.id, outboxEntries) ?? false;

  return (
    <TaskRow
      title={card.title}
      href={`/p/${card.projectId}/b/${card.boardKind}?card=${card.id}`}
      completed={completed}
      sync={syncStateOf(card.id, outboxEntries) ?? undefined}
      onToggle={
        canToggle
          ? () => {
              void mutate(
                { kind: "card.complete", cardId: card.id, completed: !completed },
                `${completed ? "Reopen" : "Complete"} “${card.title}”`,
              );
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
