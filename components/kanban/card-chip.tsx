"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { CheckIcon, GripIcon, LinesIcon } from "@/components/icons";
import { formatScore, scoreOf } from "@/lib/kanban/score";
import { formatDueLabel } from "@/components/tasks/due-label";
import { PRIORITY_ACCENT_CLASS } from "@/lib/kanban/priority";
import type { BoardCardData } from "@/lib/kanban/types";
import { OUTBOX_REVIEW_EVENT, useOutbox } from "@/lib/outbox/client";
import { syncStateOf } from "@/lib/outbox/overlay";

export function CardChip({
  card,
  onOpen,
  showScore = false,
  draggable = true,
  timeZone,
}: {
  card: BoardCardData;
  onOpen: (id: string) => void;
  showScore?: boolean;
  draggable?: boolean;
  /** Board/List share one due-date formatter (V2 S5, `due-label.ts`'s
   * `formatDueLabel`) so the two can't drift on Today/Tomorrow wording. */
  timeZone: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    data: { columnId: card.columnId },
    disabled: !draggable,
  });

  const done = card.completedAt !== null;
  // docs/OFFLINE-OUTBOX.md §7: dashed dot = queued on this device, warning
  // ring = the server rejected it (click opens the review sheet).
  const { entries: outboxEntries } = useOutbox();
  const sync = syncStateOf(card.id, outboxEntries);
  // eslint-disable-next-line react-hooks/purity -- freshness per render is intended for due badges
  const overdue = !done && card.dueAt !== null && new Date(card.dueAt).getTime() < Date.now();
  const score = scoreOf(card.impact, card.effort);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        borderTop: card.coverColor ? `3px solid ${card.coverColor}` : undefined,
      }}
      className={cn(
        // Left border color is set by exactly one of the two branches
        // below, never both: `border-border` (the general shorthand) and
        // `border-l-priority-N` (per-side) are sibling color utilities in
        // the same `@layer utilities` layer with no tailwind-merge to
        // resolve a tie, so the three unaccented sides get their own
        // `border-{side}-border` classes instead of relying on the
        // all-sides shorthand once a priority accent is in play.
        "flex overflow-hidden rounded-lg border border-t-border border-r-border border-b-border bg-surface-2 text-sm shadow-sm transition-colors hover:border-muted/50",
        !done && card.priority ? PRIORITY_ACCENT_CLASS[card.priority] : "border-l-border",
        isDragging && "opacity-40",
        done && "opacity-60",
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(card.id)}
        aria-label={`Open card: ${card.title}`}
        className="min-w-0 flex-1 p-3 text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <p className={cn("break-words", done && "line-through")}>{card.title}</p>
          {showScore && score !== null && (
            <span
              title={`Impact ${card.impact} × Effort ${card.effort}`}
              className={cn(
                "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                score >= 4
                  ? "bg-success/15 text-success"
                  : score >= 1
                    ? "bg-accent/15 text-accent-strong"
                    : "bg-surface text-muted",
              )}
            >
              {formatScore(score)}
            </span>
          )}
        </div>
        {(card.labelColors.length > 0 || card.hasDescription || card.dueAt || done) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {card.labelColors.map((c) => (
              <span
                key={c}
                aria-hidden
                className="h-2 w-4 rounded-full"
                style={{ backgroundColor: c }}
              />
            ))}
            {card.hasDescription && (
              <span aria-label="Has description" className="text-muted">
                <LinesIcon className="h-3.5 w-3.5" />
              </span>
            )}
            {card.dueAt && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-xs font-medium",
                  overdue
                    ? "bg-danger/15 text-danger"
                    : "bg-surface text-muted",
                )}
              >
                {formatDueLabel(new Date(card.dueAt), overdue, timeZone).label}
              </span>
            )}
            {done && <CheckIcon className="h-3.5 w-3.5 text-success" />}
          </div>
        )}
      </button>
      {sync === "pending" && (
        <span
          aria-label="Sync pending"
          data-sync="pending"
          className="mr-2 mt-3.5 h-2.5 w-2.5 shrink-0 rounded-full border border-dashed border-muted"
        />
      )}
      {sync === "failed" && (
        <button
          type="button"
          aria-label="Sync failed — review"
          data-sync="failed"
          onClick={() => window.dispatchEvent(new CustomEvent(OUTBOX_REVIEW_EVENT))}
          className="flex h-11 w-6 shrink-0 items-center justify-center self-start"
        >
          <span className="h-2.5 w-2.5 rounded-full border-2 border-warning" />
        </button>
      )}
      {draggable && (
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${card.title}`}
          className="flex w-11 shrink-0 cursor-grab touch-none items-center justify-center border-l border-border text-muted active:cursor-grabbing"
        >
          <GripIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
