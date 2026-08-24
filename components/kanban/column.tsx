"use client";

import { useState, useTransition } from "react";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { createCard, deleteColumn, renameColumn } from "@/lib/kanban/actions";
import { CardChip } from "@/components/kanban/card-chip";
import { Modal } from "@/components/ui/dialog";
import type {
  BoardCardData,
  BoardColumnData,
} from "@/lib/kanban/types";

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

  const { setNodeRef } = useSortable({ id: column.id });

  const others = siblings.filter((c) => c.id !== column.id);

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
      if (!res.ok) setError(res.error);
    });
    setDeleting(false);
  };

  return (
    <div
      ref={setNodeRef}
      className="flex w-[272px] shrink-0 snap-start flex-col rounded-xl bg-surface-2/60 p-2"
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
            <span className="ml-2 text-xs font-normal text-muted">
              {cards.length}
            </span>
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
          <div className="absolute right-0 top-7 z-20 w-36 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg">
            <button
              onClick={() => {
                setMenuOpen(false);
                setRenaming(true);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-muted hover:bg-surface-2 hover:text-text"
            >
              Rename
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                setError(null);
                setDeleting(true);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-danger hover:bg-surface-2"
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
