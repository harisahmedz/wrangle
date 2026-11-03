"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { PlusIcon } from "@/components/icons";
import type { IdeaRef } from "@/lib/kanban/duplicate-idea";

// Lazy: it pulls in `lib/ai`, which must stay out of first-load chunks (docs/AI.md).
const DuplicateIdeaHint = dynamic(() => import("@/components/kanban/duplicate-idea-hint"), { ssr: false });

/**
 * Shared "+ Add task" inline-add row (V2 S5 / B81) — used by both the board
 * (`Column`) and List view (`ListView`) so the two don't keep separate
 * affordances. `onAdd` applies the change (through `lib/mutations`'
 * `mutate()`, per OFFLINE-OUTBOX §9.2.6) and returns whether it succeeded;
 * a failure keeps the typed title so the caller can toast and the user can
 * retry without retyping. On success the input clears and stays open,
 * refocused, so a burst of tasks can be added without re-opening it.
 *
 * On an ideas board the caller also passes `ideas` (the board's open ideas)
 * and `onOpenCard`: after a successful add, a code match then (if AI is on)
 * one `same-idea` call may show a dismissible "Looks like …" hint (V3 S5 / A5).
 * It never delays the add and is aborted when the row unmounts.
 */
export function InlineAdd({
  onAdd,
  label = "Add task",
  emptyVariant = false,
  ideas,
  onOpenCard,
}: {
  onAdd: (title: string) => Promise<boolean>;
  label?: string;
  emptyVariant?: boolean;
  ideas?: IdeaRef[];
  onOpenCard?: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [check, setCheck] = useState<{ key: number; title: string; ideas: IdeaRef[] } | null>(null);

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    const ok = await onAdd(trimmed);
    setSubmitting(false);
    if (ok) {
      setTitle("");
      inputRef.current?.focus();
      if (ideas) setCheck((c) => ({ key: (c?.key ?? 0) + 1, title: trimmed, ideas }));
    }
  };

  const hintNode = check && (
    <DuplicateIdeaHint key={check.key} title={check.title} ideas={check.ideas} onOpenCard={onOpenCard} />
  );

  if (!adding) {
    return (
      <>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className={
            emptyVariant
              ? "w-full rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted transition-colors hover:border-muted/50 hover:text-text"
              : "flex min-h-11 w-full items-center gap-1.5 rounded-md px-1 text-left text-sm text-muted transition-colors hover:bg-surface-2 hover:text-text"
          }
        >
          {emptyVariant ? (
            label
          ) : (
            <>
              <PlusIcon className="h-4 w-4" /> {label}
            </>
          )}
        </button>
        {hintNode}
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 px-1 py-1">
        <input
          ref={inputRef}
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") setAdding(false);
          }}
          onBlur={() => {
            if (!title.trim()) setAdding(false);
          }}
          placeholder="Task title…"
          aria-label="New task title"
          className="h-11 min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-3 text-sm"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitting}
          className="rounded-md bg-accent px-3 py-2 text-xs font-medium text-accent-fg disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {hintNode}
    </>
  );
}
