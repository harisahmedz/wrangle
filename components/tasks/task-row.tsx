"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CheckIcon, CalendarIcon } from "@/components/icons";
import { dueToneClass, type DueMeta } from "@/components/tasks/due-label";

export type TaskRowProps = {
  title: string;
  href: string;
  completed: boolean;
  /** Caller supplies the mutation (TaskRow never imports server actions). */
  onToggle: () => void;
  due?: DueMeta;
  project?: { name: string; href: string };
  /** Extra content below the main line, e.g. Shutdown's Tomorrow/Done/Let go verbs. */
  trailing?: ReactNode;
  /** Runs when the title link is clicked. TaskRow stays refresh-agnostic; callers that need a `router.refresh()` on return navigation (e.g. Today) pass it here. */
  onOpen?: () => void;
  /** docs/OFFLINE-OUTBOX.md §7: dashed circle = pending, warning ring = failed. */
  sync?: "pending" | "failed";
};

export function TaskRow({
  title,
  href,
  completed,
  onToggle,
  due,
  project,
  trailing,
  onOpen,
  sync,
}: TaskRowProps) {
  return (
    <li className="border-b border-border py-2.5 last:border-b-0">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-label={completed ? `Mark ${title} as not done` : `Mark ${title} done`}
          aria-pressed={completed}
          className="group/done -m-3 flex h-11 w-11 shrink-0 items-center justify-center"
        >
          <span
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full border transition-colors",
              completed
                ? "border-success bg-success text-accent-fg"
                : "border-border text-muted group-hover/done:border-success group-hover/done:bg-success group-hover/done:text-accent-fg",
            )}
          >
            <CheckIcon
              className={cn(
                "h-3 w-3",
                completed
                  ? "opacity-100"
                  : "opacity-0 group-hover/done:opacity-100 group-focus-visible/done:opacity-100",
              )}
            />
          </span>
        </button>

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
        </div>

        {project && (
          <Link
            href={project.href}
            className="hidden max-w-[40%] shrink-0 self-start truncate pt-0.5 text-xs text-muted hover:text-text sm:block"
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
      </div>

      {trailing && <div className="mt-2.5">{trailing}</div>}
    </li>
  );
}
