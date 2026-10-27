"use client";

import { useState, useTransition } from "react";
import { CSS } from "@dnd-kit/utilities";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  deleteColumn,
  moveColumn,
  renameColumn,
  restoreColumn,
  updateColumnStyle,
} from "@/lib/kanban/actions";
import { CardChip } from "@/components/kanban/card-chip";
import { InlineAdd } from "@/components/kanban/inline-add";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GripIcon,
  MoreIcon,
} from "@/components/icons";
import { Modal } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { mutate } from "@/lib/mutations";
import { uuidv7 } from "@/lib/uuid";
import type {
  BoardCardData,
  BoardColumnData,
} from "@/lib/kanban/types";
import { cn } from "@/lib/utils";
import { COLUMN_COLORS } from "@/lib/palette";

export function Column({
  column,
  cards,
  siblings,
  onOpenCard,
  showScore = false,
  canEdit,
  canManageColumns,
  reorderEnabled,
  filtered,
  timeZone,
}: {
  column: BoardColumnData;
  cards: BoardCardData[];
  siblings: BoardColumnData[];
  onOpenCard: (id: string) => void;
  showScore?: boolean;
  canEdit: boolean;
  canManageColumns: boolean;
  reorderEnabled: boolean;
  filtered: boolean;
  timeZone: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [targetColumnId, setTargetColumnId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const pushToast = useToast();

  const {
    setNodeRef,
    attributes,
    listeners,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.id,
    disabled: { draggable: !canManageColumns || !reorderEnabled },
  });

  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const others = siblings.filter((c) => c.id !== column.id);
  const overWip =
    column.wipLimit !== null && cards.length > column.wipLimit;

  const addCard = async (cardTitle: string): Promise<boolean> => {
    const res = await mutate({
      kind: "card.create",
      id: uuidv7(),
      target: { columnId: column.id },
      title: cardTitle,
    });
    if (!res.ok) {
      pushToast({ message: res.error });
      return false;
    }
    return true;
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
          undoFd.set("movedCards", JSON.stringify(res.data.movedCards));
          void restoreColumn(undoFd);
        },
      });
    });
  };

  const grip = (
    <button
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Reorder ${column.name}`}
      title="Drag to reorder"
      className="flex h-11 w-11 shrink-0 cursor-grab touch-none select-none items-center justify-center rounded text-xs leading-none text-muted transition-opacity sm:h-auto sm:w-auto sm:px-1 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
    >
      <GripIcon className="h-4 w-4" />
    </button>
  );

  if (column.isCollapsed) {
    return (
      <div
        ref={setNodeRef}
        style={{
          ...dragStyle,
          ...(column.color ? { borderLeftColor: column.color } : undefined),
        }}
        className={cn(
          "group flex w-12 shrink-0 snap-start cursor-pointer flex-col items-center gap-2 rounded-xl border border-l-4 bg-surface py-3",
          column.isDone && "border-l-success",
          isDragging && "opacity-40",
        )}
        onClick={canManageColumns ? () => style({ isCollapsed: "false" }) : undefined}
        role={canManageColumns ? "button" : undefined}
        tabIndex={canManageColumns ? 0 : undefined}
        onKeyDown={canManageColumns ? (e) => e.key === "Enter" && style({ isCollapsed: "false" }) : undefined}
        aria-label={`Expand ${column.name}`}
        title={column.name}
      >
        {canManageColumns && grip}
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
      style={{
        ...dragStyle,
        ...(column.color ? { borderLeftColor: column.color } : undefined),
      }}
      className={cn(
        "group flex w-[272px] shrink-0 snap-start flex-col rounded-xl border border-l-4 bg-surface p-2",
        column.isDone && "border-l-success",
        isDragging && "opacity-40",
      )}
    >
      <div className="relative mb-2 flex items-center justify-between gap-1 px-1">
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
          <div className="flex min-w-0 items-center gap-1">
            {canManageColumns && grip}
            <h2
              onDoubleClick={() => setRenaming(true)}
              title="Double-click to rename"
              className="min-w-0 cursor-text truncate text-sm font-semibold"
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
                <CheckIcon className="ml-1.5 inline h-3.5 w-3.5 text-success" />
              )}
            </h2>
          </div>
        )}
        {canManageColumns && (
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={`Column menu for ${column.name}`}
            aria-expanded={menuOpen}
            className="flex h-11 w-11 items-center justify-center rounded text-muted transition-opacity sm:h-auto sm:w-auto sm:px-1.5 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
          >
            <MoreIcon className="h-4 w-4" />
          </button>
        )}
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
                className="flex flex-1 items-center gap-1 px-3 py-2 text-muted hover:bg-surface-2 hover:text-text"
              >
                <ChevronLeftIcon className="h-3.5 w-3.5" /> Move
              </button>
              <button
                onClick={() => shift("right")}
                className="flex flex-1 items-center justify-end gap-1 px-3 py-2 text-muted hover:bg-surface-2 hover:text-text"
              >
                Move <ChevronRightIcon className="h-3.5 w-3.5" />
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
        <div className="scrollbar-thin flex min-h-10 flex-col gap-2 overflow-y-auto">
          {cards.map((card) => (
            <CardChip
              key={card.id}
              card={card}
              onOpen={onOpenCard}
              showScore={showScore}
              draggable={canEdit && reorderEnabled}
              timeZone={timeZone}
            />
          ))}
          {cards.length === 0 && (
            !filtered && canEdit ? (
              <InlineAdd onAdd={addCard} label="Add the first card" emptyVariant />
            ) : (
              <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
                {filtered ? "No cards match" : "No cards"}
              </p>
            )
          )}
        </div>
      </SortableContext>

      {canEdit && (cards.length > 0 || filtered) && (
        <div className="mt-2">
          <InlineAdd onAdd={addCard} />
        </div>
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
    <div className="w-[240px] shrink-0 rounded-xl border bg-surface p-2">
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
