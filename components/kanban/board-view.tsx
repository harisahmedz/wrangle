"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { generateKeyBetween } from "fractional-indexing";
import { BoardTabs } from "@/components/kanban/board-tabs";
import { AddColumn, Column } from "@/components/kanban/column";
import {
  createColumn,
  reorderColumn,
} from "@/lib/kanban/actions";
import { mutate } from "@/lib/mutations";
import { useOutbox } from "@/lib/outbox/client";
import { overlayCards } from "@/lib/outbox/overlay";
import { openIdeas } from "@/lib/kanban/duplicate-idea";
import { reorderById } from "@/lib/order";
import { useToast } from "@/components/ui/toast";
import type { BoardKind } from "@/db/schema";
import { cn } from "@/lib/utils";
import { scoreOf } from "@/lib/kanban/score";
import { passesFilters } from "@/lib/kanban/filters";
import {
  EMPTY_BOARD_FILTERS,
  parseBoardFilters,
  type BoardCardData,
  type BoardColumnData,
  type BoardFilters,
  type BoardSearchRecord,
  type DueFilter,
} from "@/lib/kanban/types";

type Props = {
  projectId: string;
  boardId: string;
  boardKind: BoardKind;
  columns: BoardColumnData[];
  cards: BoardCardData[];
  filterLabels: Array<{ id: string; name: string }>;
  filterMembers: Array<{ userId: string; name: string | null }>;
  canEdit: boolean;
  canManageColumns: boolean;
  toolbarEnd: ReactNode;
  /** The View menu (Layout/Group by/Sort/Show completed), V2 S4. Optional so other BoardView usages keep working untouched. */
  viewMenu?: ReactNode;
  /** The viewer's `users.timezone` (S4) — decides the "today" boundary for the due filter via `lib/kanban/filters.ts`. */
  timeZone: string;
};

type UpdateFilters = (mutate: (f: BoardFilters) => BoardFilters) => void;

const FILTER_PARAM_KEYS = ["q", "label", "assignee", "due"] as const;

const FILTER_DEBOUNCE_MS = 250;

function FilterBar({
  filters,
  update,
  labels,
  members,
  activeCount,
}: {
  filters: BoardFilters;
  update: UpdateFilters;
  labels: Array<{ id: string; name: string }>;
  members: Array<{ userId: string; name: string | null }>;
  activeCount: number;
}) {
  const [text, setText] = useState(filters.q);
  const [syncedQ, setSyncedQ] = useState(filters.q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (syncedQ !== filters.q) {
    setSyncedQ(filters.q);
    setText(filters.q);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const onTextChange = (value: string) => {
    setText(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      update((f) => ({ ...f, q: value }));
    }, FILTER_DEBOUNCE_MS);
  };

  const toggleId = (ids: string[], id: string) =>
    ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id];

  return (
    <div
      id="board-filters"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2"
    >
      <input
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder="Filter by text…"
        aria-label="Filter cards by text"
        className="h-11 min-w-0 flex-[1_1_12rem] rounded-md border border-border bg-surface-2 px-3 text-sm"
      />
      <select
        value={filters.due ?? "any"}
        onChange={(e) =>
          update((f) => ({
            ...f,
            due: e.target.value === "any" ? null : (e.target.value as DueFilter),
          }))
        }
        aria-label="Filter by due date"
        className="h-11 rounded-md border border-border bg-surface-2 px-2 text-sm"
      >
        <option value="any">Due: any</option>
        <option value="overdue">Overdue</option>
        <option value="today">Today</option>
        <option value="week">This week</option>
        <option value="none">No date</option>
      </select>
      {(labels.length > 0 || members.length > 0) && (
        <>
          {labels.map((l) => {
            const active = filters.labelIds.includes(l.id);
            return (
              <button
                key={l.id}
                onClick={() => update((f) => ({ ...f, labelIds: toggleId(f.labelIds, l.id) }))}
                aria-pressed={active}
                className={cn(
                  "min-h-11 rounded-full border border-border px-3 py-0.5 text-xs",
                  active ? "bg-accent/15 text-text" : "text-muted hover:text-text",
                )}
              >
                {l.name}
              </button>
            );
          })}
          {members.map((m) => {
            const active = filters.assigneeIds.includes(m.userId);
            return (
              <button
                key={m.userId}
                onClick={() =>
                  update((f) => ({ ...f, assigneeIds: toggleId(f.assigneeIds, m.userId) }))
                }
                aria-pressed={active}
                className={cn(
                  "min-h-11 rounded-full border border-border px-3 py-0.5 text-xs",
                  active ? "bg-accent/15 text-text" : "text-muted hover:text-text",
                )}
              >
                @{(m.name ?? "?").split(" ")[0]}
              </button>
            );
          })}
        </>
      )}
      {activeCount > 0 && (
        <button
          onClick={() => update(() => EMPTY_BOARD_FILTERS)}
          className="ml-auto text-xs text-muted hover:text-danger"
        >
          Clear ({activeCount})
        </button>
      )}
    </div>
  );
}

export function BoardView({
  projectId,
  boardId,
  boardKind,
  columns: serverColumns,
  cards: serverCards,
  filterLabels,
  filterMembers,
  canEdit,
  canManageColumns,
  toolbarEnd,
  viewMenu,
  timeZone,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pushToast = useToast();
  const { entries: outboxEntries, offline } = useOutbox();
  const [columns, setColumns] = useState(serverColumns);
  const [syncedColumns, setSyncedColumns] = useState(serverColumns);
  const [sortByScore, setSortByScore] = useState(false);
  const [, startTransition] = useTransition();

  if (syncedColumns !== serverColumns) {
    setSyncedColumns(serverColumns);
    setColumns(serverColumns);
  }

  // The outbox overlay *is* the optimistic card state (OFFLINE-OUTBOX §2.3):
  // queued creates/moves/completes show immediately and survive reloads.
  const cards = useMemo(
    () => overlayCards(serverCards, columns, outboxEntries, { projectId, boardKind }),
    [serverCards, columns, outboxEntries, projectId, boardKind],
  );

  const ideas = useMemo(
    () => (boardKind === "ideas" ? openIdeas(cards) : undefined),
    [cards, boardKind],
  );

  const spRecord = useMemo<BoardSearchRecord>(() => {
    const rec: BoardSearchRecord = {};
    for (const key of new Set(searchParams.keys())) {
      const all = searchParams.getAll(key);
      rec[key] = all.length > 1 ? all : all[0];
    }
    return rec;
  }, [searchParams]);

  const filters = useMemo(() => parseBoardFilters(spRecord), [spRecord]);

  const writeFilters = (next: BoardFilters) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of FILTER_PARAM_KEYS) params.delete(key);
    if (next.q) params.set("q", next.q);
    for (const id of next.labelIds) params.append("label", id);
    for (const id of next.assigneeIds) params.append("assignee", id);
    if (next.due) params.set("due", next.due);
    const qs = params.toString();
    const href = `/p/${projectId}/b/${boardKind}${qs ? `?${qs}` : ""}`;
    startTransition(() => router.replace(href, { scroll: false }));
  };

  const updateFilters: UpdateFilters = (mutate) => {
    writeFilters(mutate(parseBoardFilters(spRecord)));
  };

  const activeFilterCount =
    (filters.q ? 1 : 0) +
    filters.labelIds.length +
    filters.assigneeIds.length +
    (filters.due !== null ? 1 : 0);
  const [filterOpen, setFilterOpen] = useState(activeFilterCount > 0);
  const reorderEnabled = activeFilterCount === 0 && !sortByScore;

  const byColumn = (() => {
    const map = new Map<string, BoardCardData[]>();
    for (const col of columns) map.set(col.id, []);
    for (const c of cards) {
      if (activeFilterCount === 0 || passesFilters(c, filters, timeZone)) {
        map.get(c.columnId)?.push(c);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (sortByScore && boardKind === "ideas") {
          const sa = scoreOf(a.impact, a.effort);
          const sb = scoreOf(b.impact, b.effort);
          if (sa !== null && sb !== null && sa !== sb) return sb - sa;
        }
        return a.position < b.position ? -1 : 1;
      });
    }
    return map;
  })();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const openCard = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("card", id);
    router.push(`/p/${projectId}/b/${boardKind}?${params.toString()}`, {
      scroll: false,
    });
  };

  const addColumn = (name: string) => {
    const fd = new FormData();
    fd.set("boardId", boardId);
    fd.set("name", name);
    startTransition(async () => {
      const res = await createColumn(fd);
      if (!res.ok) {
        pushToast({ message: res.error });
        return;
      }
      setColumns((prev) => [
        ...prev,
        {
          id: res.data.columnId,
          name,
          position: res.data.position,
          color: null,
          wipLimit: null,
          isDone: false,
          isCollapsed: false,
        },
      ]);
    });
  };

  const persistMove = (card: BoardCardData, toColumnId: string, position: string) => {
    void mutate(
      { kind: "card.move", cardId: card.id, toColumnId, position },
      `Move “${card.title}”`,
    ).then((res) => {
      if (!res.ok) pushToast({ message: res.error });
    });
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Column reorder path
    if (columns.some((c) => c.id === String(active.id))) {
      if (!canManageColumns || !reorderEnabled) return;
      const result = reorderById(columns, String(active.id), String(over.id));
      if (!result || !columns.some((c) => c.id === String(over.id))) return;
      setColumns(result.items);
      const fd = new FormData();
      fd.set("columnId", result.id);
      fd.set("position", result.position);
      startTransition(async () => {
        const res = await reorderColumn(fd);
        if (!res.ok) {
          pushToast({ message: res.error });
          router.refresh();
        }
      });
      return;
    }

    const activeCard = cards.find((c) => c.id === String(active.id));
    if (!activeCard || !canEdit || !reorderEnabled) return;

    const overIsColumn = columns.some((c) => c.id === String(over.id));

    let targetColumnId: string;
    let targetIndex: number;

    if (overIsColumn) {
      targetColumnId = String(over.id);
      targetIndex = (byColumn.get(targetColumnId) ?? []).length;
    } else {
      const overCard = cards.find((c) => c.id === String(over.id));
      if (!overCard) return;
      targetColumnId = overCard.columnId;
      targetIndex = (byColumn.get(targetColumnId) ?? []).findIndex(
        (c) => c.id === overCard.id,
      );
      if (targetIndex === -1) return;
    }

    const sourceList = [...(byColumn.get(activeCard.columnId) ?? [])];
    const sourceIndex = sourceList.findIndex((c) => c.id === activeCard.id);

    let finalList: BoardCardData[];
    let insertAt: number;

    if (activeCard.columnId === targetColumnId) {
      insertAt = targetIndex;
      finalList = sourceList;
      finalList.splice(sourceIndex, 1);
      finalList.splice(insertAt, 0, activeCard);
    } else {
      const targetList = [...(byColumn.get(targetColumnId) ?? [])];
      sourceList.splice(sourceIndex, 1);
      insertAt = targetIndex;
      targetList.splice(insertAt, 0, activeCard);
      finalList = targetList;
    }

    const before = finalList[insertAt - 1]?.position ?? null;
    const after = finalList[insertAt + 1]?.position ?? null;
    const newPosition = generateKeyBetween(before, after);

    persistMove(activeCard, targetColumnId, newPosition);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <BoardTabs projectId={projectId} active={boardKind} />
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <button
            type="button"
            onClick={() => setFilterOpen((o) => !o)}
            aria-expanded={filterOpen}
            aria-controls="board-filters"
            className={cn(
              "flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors",
              activeFilterCount > 0
                ? "border-accent/50 bg-accent/10 text-text"
                : "border-border text-muted hover:text-text",
            )}
          >
            Filter
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold tabular-nums text-accent-fg">
                {activeFilterCount}
              </span>
            )}
          </button>
          {boardKind === "ideas" && (
            <button
              type="button"
              onClick={() => setSortByScore((s) => !s)}
              aria-pressed={sortByScore}
              className={cn(
                "min-h-11 rounded-md border px-3 text-sm transition-colors",
                sortByScore
                  ? "border-accent/50 bg-accent/10 text-text"
                  : "border-border text-muted hover:text-text",
              )}
            >
              Sort by score
            </button>
          )}
          {viewMenu}
          {toolbarEnd}
        </div>
      </div>

      {filterOpen && (
        <FilterBar
          filters={filters}
          update={updateFilters}
          labels={filterLabels}
          members={filterMembers}
          activeCount={activeFilterCount}
        />
      )}

      {!reorderEnabled && canEdit && (
        <p className="text-xs text-muted">
          Clear filters and score sorting to reorder cards.
        </p>
      )}

      <DndContext
        id="board"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={onDragEnd}
      >
        <div className="scrollbar-thin -mx-4 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
          <SortableContext
            items={columns.map((col) => col.id)}
            strategy={horizontalListSortingStrategy}
          >
            {columns.map((col) => (
              <Column
                key={col.id}
                column={col}
                siblings={columns}
                cards={byColumn.get(col.id) ?? []}
                onOpenCard={openCard}
                showScore={boardKind === "ideas"}
                ideas={ideas}
                canEdit={canEdit}
                canManageColumns={canManageColumns}
                reorderEnabled={reorderEnabled}
                filtered={activeFilterCount > 0}
                timeZone={timeZone}
              />
            ))}
          </SortableContext>
          {canManageColumns && <AddColumn onAdd={addColumn} disabled={offline} />}
        </div>
      </DndContext>
    </div>
  );
}
