"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { formatScore, scoreOf } from "@/lib/kanban/score";
import type { BoardCardData } from "@/lib/kanban/types";

export function formatDue(dueAt: string): string {
  const d = new Date(dueAt);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / 86_400_000,
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function CardChip({
  card,
  onOpen,
  showScore = false,
  draggable = true,
}: {
  card: BoardCardData;
  onOpen: (id: string) => void;
  showScore?: boolean;
  draggable?: boolean;
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
        "flex overflow-hidden rounded-lg border border-border bg-surface-2 text-sm shadow-sm transition-colors hover:border-muted/50",
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
                  ? "bg-emerald-500/15 text-emerald-500"
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
              <span aria-label="Has description" className="text-xs text-muted">
                ☰
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
                {formatDue(card.dueAt)}
              </span>
            )}
            {done && <span className="text-xs text-muted">✓</span>}
          </div>
        )}
      </button>
      {draggable && (
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${card.title}`}
          className="flex w-11 shrink-0 cursor-grab touch-none items-center justify-center border-l border-border text-muted active:cursor-grabbing"
        >
          ⋮⋮
        </button>
      )}
    </div>
  );
}
