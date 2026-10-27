"use client";

import Link from "next/link";
import { forwardRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CheckIcon, CalendarIcon } from "@/components/icons";
import { dueToneClass, type DueMeta } from "@/components/tasks/due-label";

export type TaskRowProps = {
  title: string;
  href: string;
  completed: boolean;
  /** Caller supplies the mutation (TaskRow never imports server actions).
   * Omit for a non-interactive row (e.g. a `viewer`-role card) — renders a
   * plain, non-button circle instead of a checkbox. */
  onToggle?: () => void;
  due?: DueMeta;
  /** Freeform meta line for rows with no literal due date (e.g. Learn's
   * type/progress%/target-date summary, V2 S4b). Ignored when `due` is set —
   * a row has at most one meta line. */
  meta?: ReactNode;
  project?: { name: string; href: string };
  /** Show the project tag below `sm` too — mixed-project lists (Upcoming,
   * Today's "Next up") need it visible at every width, unlike grouped
   * lists where it stays `sm`+ only. */
  showProjectOnPhone?: boolean;
  /** Extra content below the main line, e.g. Shutdown's Tomorrow/Done/Let go verbs. */
  trailing?: ReactNode;
  /** Runs when the title link is clicked. TaskRow stays refresh-agnostic; callers that need a `router.refresh()` on return navigation (e.g. Today) pass it here. */
  onOpen?: () => void;
  /** docs/OFFLINE-OUTBOX.md §7: dashed circle = pending, warning ring = failed. */
  sync?: "pending" | "failed";
  /** Drag handle for reorderable contexts (List view, V2 S4). Omit when the row isn't draggable. */
  dragHandle?: ReactNode;
  /** dnd-kit transform/transition, applied to the row's `<li>`. */
  style?: CSSProperties;
  className?: string;
};

export const TaskRow = forwardRef<HTMLLIElement, TaskRowProps>(function TaskRow(
  {
    title,
    href,
    completed,
    onToggle,
    due,
    meta,
    project,
    showProjectOnPhone,
    trailing,
    onOpen,
    sync,
    dragHandle,
    style,
    className,
  },
  ref,
) {
  const checkboxGlyph = (
    <span
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded-full border transition-colors",
        completed
          ? "border-success bg-success text-accent-fg"
          : onToggle
            ? "border-border text-muted group-hover/done:border-success group-hover/done:bg-success group-hover/done:text-accent-fg"
            : "border-border text-muted",
      )}
    >
      <CheckIcon
        className={cn(
          "h-3 w-3",
          completed
            ? "opacity-100"
            : onToggle
              ? "opacity-0 group-hover/done:opacity-100 group-focus-visible/done:opacity-100"
              : "opacity-0",
        )}
      />
    </span>
  );

  return (
    <li ref={ref} style={style} className={cn("border-b border-border py-2.5 last:border-b-0", className)}>
      <div className="flex items-start gap-3">
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={completed ? `Mark ${title} as not done` : `Mark ${title} done`}
            aria-pressed={completed}
            className="group/done -m-3 flex h-11 w-11 shrink-0 items-center justify-center"
          >
            {checkboxGlyph}
          </button>
        ) : (
          <span
            role="img"
            aria-label={completed ? `${title} is done` : `${title} is not done`}
            className="-m-3 flex h-11 w-11 shrink-0 items-center justify-center"
          >
            {checkboxGlyph}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <Link
            href={href}
            onClick={onOpen}
            className={cn(
              "block truncate text-sm",
              completed && "text-muted line-through",
            )}
          >
            {title}
          </Link>
          {due && (
            <div
              className={cn(
                "mt-0.5 flex items-center gap-1 text-xs",
                dueToneClass[due.tone],
              )}
            >
              <CalendarIcon className="h-3 w-3" />
              <span>{due.label}</span>
            </div>
          )}
          {!due && meta && <p className="mt-0.5 truncate text-xs text-muted">{meta}</p>}
        </div>

        {project && (
          <Link
            href={project.href}
            className={cn(
              "max-w-[40%] shrink-0 self-start truncate pt-0.5 text-xs text-muted hover:text-text",
              showProjectOnPhone ? "block" : "hidden sm:block",
            )}
          >
            {project.name} #
          </Link>
        )}

        {sync && (
          <span
            aria-label={sync === "pending" ? "Sync pending" : "Sync failed"}
            className={cn(
              "mt-1 h-2.5 w-2.5 shrink-0 self-start rounded-full",
              sync === "pending" && "border border-dashed border-muted",
              sync === "failed" && "border-2 border-warning",
            )}
          />
        )}

        {dragHandle}
      </div>

      {trailing && <div className="mt-2.5">{trailing}</div>}
    </li>
  );
});
