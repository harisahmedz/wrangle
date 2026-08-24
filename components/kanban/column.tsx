"use client";

import { useState, useTransition } from "react";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  createCard,
  deleteColumn,
  moveColumn,
  renameColumn,
  restoreColumn,
  updateColumnStyle,
} from "@/lib/kanban/actions";
import { CardChip } from "@/components/kanban/card-chip";
import { Modal } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type {
  BoardCardData,
  BoardColumnData,
} from "@/lib/kanban/types";
import { cn } from "@/lib/utils";

const COLUMN_COLORS = [
  null,
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

export function Column({
  column,
  cards,
  siblings,
  onOpenCard,
  showScore = false,
}: {
  column: BoardColumnData;
  cards: BoardCardData[];
  siblings: BoardColumnData[];
  onOpenCard: (id: string) => void;
  showScore?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [targetColumnId, setTargetColumnId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const pushToast = useToast();

  const { setNodeRef } = useSortable({ id: column.id });

  const others = siblings.filter((c) => c.id !== column.id);
  const overWip =
    column.wipLimit !== null && cards.length > column.wipLimit;

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const fd = new FormData();
    fd.set("columnId", column.id);
    fd.set("title", trimmed);
    startTransition(async () => {
      await createCard(fd);
    });
    setTitle("");
  };

  const doRename = (name: string) => {
    const fd = new FormData();
    fd.set("columnId", column.id);
    fd.set("name", name);
    startTransition(async () => {
      await renameColumn(fd);
    });
  };

  const style = (patch: Record<string, string>) => {
    const fd = new FormData();
    fd.set("columnId", column.id);
    for (const [k, v] of Object.entries(patch)) fd.set(k, v);
    startTransition(async () => {
      await updateColumnStyle(fd);
    });
  };

  const shift = (direction: "left" | "right") => {
    setMenuOpen(false);
    const fd = new FormData();
    fd.set("columnId", column.id);
    fd.set("direction", direction);
    startTransition(async () => {
      await moveColumn(fd);
    });
  };

  const doDelete = () => {
    if (cards.length > 0 && !targetColumnId) {
      setError("Choose where the cards should go");
      return;
    }
    const fd = new FormData();
    fd.set("columnId", column.id);
    if (targetColumnId) fd.set("targetColumnId", targetColumnId);
    startTransition(async () => {
      const res = await deleteColumn(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDeleting(false);
      pushToast({
        message: `Column “${column.name}” deleted`,
        actionLabel: "Undo",
        onAction: () => {
          const undoFd = new FormData();
          undoFd.set("columnId", column.id);
          void restoreColumn(undoFd);
        },
      });
    });
  };

  if (column.isCollapsed) {
    return (
      <div
        ref={setNodeRef}
        className={cn(
          "flex w-12 shrink-0 snap-start cursor-pointer flex-col items-center gap-2 rounded-xl border-l-4 bg-surface-2/60 py-3",
          column.isDone && "border-emerald-500",
        )}
        style={column.color ? { borderLeftColor: column.color } : undefined}
        onClick={() => style({ isCollapsed: "false" })}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && style({ isCollapsed: "false" })}
        aria-label={`Expand ${column.name}`}
        title={column.name}
      >
        <span
          className="text-sm font-semibold"
          style={{ writingMode: "vertical-rl" }}
        >
          {column.name}
        </span>
        <span className="text-xs text-muted">{cards.length}</span>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-[272px] shrink-0 snap-start flex-col rounded-xl border-l-4 bg-surface-2/60 p-2",
        column.isDone && "border-emerald-500",
      )}
      style={column.color ? { borderLeftColor: column.color } : undefined}
    >
      <div className="group relative mb-2 flex items-center justify-between px-1">
        {renaming ? (
          <input
            autoFocus
            defaultValue={column.name}
            onBlur={(e) => {
              setRenaming(false);
              const name = e.target.value.trim();
              if (name && name !== column.name) doRename(name);
            }}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className="w-full rounded border border-accent bg-surface px-2 py-1 text-sm font-semibold"
            aria-label="Rename column"
          />
        ) : (
          <h2
            onDoubleClick={() => setRenaming(true)}
            title="Double-click to rename"
            className="cursor-text truncate text-sm font-semibold"
          >
            {column.name}
            <span
              className={cn(
                "ml-2 text-xs font-normal tabular-nums",
                overWip ? "text-danger" : "text-muted",
              )}
            >
              {cards.length}
              {column.wipLimit !== null && `/${column.wipLimit}`}
            </span>
            {column.isDone && (
              <span className="ml-1.5 text-xs text-emerald-500">✓</span>
            )}
          </h2>
        )}
        <button
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={`Column menu for ${column.name}`}
          aria-expanded={menuOpen}
          className="rounded px-1.5 text-muted opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          ⋯
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-7 z-20 w-48 overflow-hidden rounded-lg border border-border bg-surface py-1.5 shadow-lg">
            <div className="flex justify-between gap-1 px-2.5 pb-1.5">
              {COLUMN_COLORS.map((c, i) => (
                <button
                  key={i}
                  onClick={() => style({ color: c ?? "" })}
                  aria-label={c ? `Color ${c}` : "No color"}
                  className={cn(
                    "h-5 w-5 rounded-full border",
                    c ? "border-transparent" : "border-dashed border-muted",
                    (column.color ?? null) === c && "ring-2 ring-text",
                  )}
                  style={c ? { backgroundColor: c } : undefined}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 border-t border-border px-2.5 py-1.5 text-xs text-muted">
              WIP limit
              <input
                type="number"
                min={1}
                max={99}
                defaultValue={column.wipLimit ?? ""}
                placeholder="–"
                aria-label="WIP limit"
                onBlur={(e) => style({ wipLimit: e.target.value })}
                onKeyDown={(e) =>
                  e.key === "Enter" && style({ wipLimit: e.currentTarget.value })
                }
                className="h-6 w-14 rounded border border-border bg-surface-2 px-1 text-xs tabular-nums"
              />
            </div>
            <button
              onClick={() => {
                setMenuOpen(false);
                style({ isCollapsed: String(!column.isCollapsed) });
              }}
              className="block w-full px-3 py-2 text-left text-sm text-muted hover:bg-surface-2 hover:text-text"
            >
              Collapse column
            </button>
            <div className="flex border-t border-border text-xs">
              <button
                onClick={() => shift("left")}
                className="flex-1 px-3 py-2 text-left text-muted hover:bg-surface-2 hover:text-text"
              >
                ◀ Move
              </button>
              <button
                onClick={() => shift("right")}
                className="flex-1 px-3 py-2 text-right text-muted hover:bg-surface-2 hover:text-text"
              >
                Move ▶
              </button>
            </div>
            <button
              onClick={() => {
                setMenuOpen(false);
                setError(null);
                setDeleting(true);
              }}
              className="block w-full border-t border-border px-3 py-2 text-left text-sm text-danger hover:bg-surface-2"
            >
              Delete column
            </button>
          </div>
        )}
      </div>

      <SortableContext
        items={cards.map((c) => c.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex min-h-[8px] flex-col gap-2 overflow-y-auto">
          {cards.map((card) => (
            <CardChip
              key={card.id}
              card={card}
              onOpen={onOpenCard}
              showScore={showScore}
            />
          ))}
        </div>
      </SortableContext>

      {adding ? (
        <div className="mt-2">
          <textarea
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
                setAdding(false);
              }
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="Card title…"
            rows={2}
            aria-label="New card title"
            className="w-full resize-none rounded-lg border border-border bg-surface p-2 text-sm"
          />
          <div className="mt-1 flex gap-2">
            <button
              onClick={() => {
                submit();
                setAdding(false);
              }}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg"
            >
              Add
            </button>
            <button
              onClick={() => setAdding(false)}
              className="px-2 text-xs text-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-2 rounded-md px-2 py-1.5 text-left text-sm text-muted transition-colors hover:bg-surface hover:text-text"
        >
          + Add card
        </button>
      )}

      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        label={`Delete ${column.name}`}
      >
        <h3 className="mb-2 text-lg font-semibold">Delete “{column.name}”?</h3>
        {cards.length > 0 ? (
          <>
            <p className="mb-3 text-sm text-muted">
              This column has {cards.length} card{cards.length === 1 ? "" : "s"}.
              Move them where?
            </p>
            <select
              value={targetColumnId}
              onChange={(e) => setTargetColumnId(e.target.value)}
              aria-label="Move cards to"
              className="mb-4 h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm"
            >
              <option value="">Select a column…</option>
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </>
        ) : (
          <p className="mb-4 text-sm text-muted">This column is empty.</p>
        )}
        {error && <p className="mb-3 text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setDeleting(false)}
            className="rounded-md px-3 py-2 text-sm text-muted hover:text-text"
          >
            Cancel
          </button>
          <button
            onClick={doDelete}
            disabled={cards.length > 0 && !targetColumnId}
            className="rounded-md bg-danger px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Delete column
          </button>
        </div>
      </Modal>
    </div>
  );
}

export function AddColumn({ onAdd }: { onAdd: (name: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  if (!adding) {
    return (
      <button
        onClick={() => setAdding(true)}
        className="h-min w-[240px] shrink-0 rounded-xl border border-dashed border-border px-3 py-3 text-left text-sm text-muted transition-colors hover:text-text"
      >
        + Add column
      </button>
    );
  }

  const add = () => {
    if (!name.trim()) return;
    onAdd(name.trim());
    setName("");
    setAdding(false);
  };

  return (
    <div className="w-[240px] shrink-0 rounded-xl bg-surface-2/60 p-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") add();
          if (e.key === "Escape") setAdding(false);
        }}
        placeholder="Column name"
        className="w-full rounded-md border border-accent bg-surface px-2 py-1.5 text-sm"
        aria-label="New column name"
      />
      <div className="mt-2 flex gap-2">
        <button
          onClick={add}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg"
        >
          Add column
        </button>
        <button onClick={() => setAdding(false)} className="px-2 text-xs text-muted">
          Cancel
        </button>
      </div>
    </div>
  );
}
