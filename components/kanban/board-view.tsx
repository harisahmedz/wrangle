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
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { generateKeyBetween } from "fractional-indexing";
import { AddColumn, Column } from "@/components/kanban/column";
import {
  createColumn,
  moveCard,
} from "@/lib/kanban/actions";
import { useToast } from "@/components/ui/toast";
import type { BoardKind } from "@/db/schema";
import { cn } from "@/lib/utils";
import { scoreOf } from "@/lib/kanban/score";
import type {
  BoardCardData,
  BoardColumnData,
} from "@/lib/kanban/types";

type DueFilter = "any" | "overdue" | "today" | "week" | "none";

type Filters = {
  text: string;
  labelIds: string[];
  assigneeIds: string[];
  due: DueFilter;
};

const EMPTY_FILTERS: Filters = {
  text: "",
  labelIds: [],
  assigneeIds: [],
  due: "any",
};

function matchesDue(card: BoardCardData, due: DueFilter): boolean {
  if (due === "any") return true;
  if (due === "none") return card.dueAt === null;
  if (!card.dueAt) return false;
  const t = new Date(card.dueAt).getTime();
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  if (due === "overdue") return t < todayStart && card.completedAt === null;
  if (due === "today") return t < todayStart + DAY_MS;
  return t < todayStart + 8 * DAY_MS;
}

const DAY_MS = 86_400_000;

function passesFilters(card: BoardCardData, f: Filters): boolean {
  if (f.text) {
    const q = f.text.toLowerCase();
    if (
      !card.title.toLowerCase().includes(q)
    ) {
      return false;
    }
  }
  if (f.labelIds.length > 0 && !f.labelIds.some((id) => card.labelIds.includes(id))) {
    return false;
  }
  if (
    f.assigneeIds.length > 0 &&
    !f.assigneeIds.some((id) => card.assigneeIds.includes(id))
  ) {
    return false;
  }
  return matchesDue(card, f.due);
}

type Props = {
  projectId: string;
  boardId: string;
  boardKind: BoardKind;
  columns: BoardColumnData[];
  cards: BoardCardData[];
  filterLabels: Array<{ id: string; name: string }>;
  filterMembers: Array<{ userId: string; name: string | null }>;
};

function FilterBar({
  filters,
  setFilters,
  labels,
  members,
  activeCount,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  labels: Array<{ id: string; name: string }>;
  members: Array<{ userId: string; name: string | null }>;
  activeCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2">
      <input
        value={filters.text}
        onChange={(e) => setFilters({ ...filters, text: e.target.value })}
        placeholder="Filter by text…"
        aria-label="Filter cards by text"
        className="h-8 w-40 rounded-md border border-border bg-surface-2 px-2 text-sm"
      />
      <select
        value={filters.due}
        onChange={(e) => setFilters({ ...filters, due: e.target.value as DueFilter })}
        aria-label="Filter by due date"
        className="h-8 rounded-md border border-border bg-surface-2 px-1.5 text-sm"
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
                onClick={() =>
                  setFilters({
                    ...filters,
                    labelIds: active
                      ? filters.labelIds.filter((id) => id !== l.id)
                      : [...filters.labelIds, l.id],
                  })
                }
                aria-pressed={active}
                className={cn(
                  "rounded-full border border-border px-2 py-0.5 text-xs",
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
                  setFilters({
                    ...filters,
                    assigneeIds: active
                      ? filters.assigneeIds.filter((id) => id !== m.userId)
                      : [...filters.assigneeIds, m.userId],
                  })
                }
                aria-pressed={active}
                className={cn(
                  "rounded-full border border-border px-2 py-0.5 text-xs",
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
          onClick={() => setFilters(EMPTY_FILTERS)}
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
}: Props) {
  const router = useRouter();
  const pushToast = useToast();
  const [columns, setColumns] = useState(serverColumns);
  const [cards, setCards] = useState(serverCards);
  const [syncedColumns, setSyncedColumns] = useState(serverColumns);
  const [syncedCards, setSyncedCards] = useState(serverCards);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sortByScore, setSortByScore] = useState(false);
  const [, startTransition] = useTransition();

  if (syncedColumns !== serverColumns) {
    setSyncedColumns(serverColumns);
    setColumns(serverColumns);
  }
  if (syncedCards !== serverCards) {
    setSyncedCards(serverCards);
    setCards(serverCards);
  }

  const activeFilterCount =
    (filters.text ? 1 : 0) +
    filters.labelIds.length +
    filters.assigneeIds.length +
    (filters.due !== "any" ? 1 : 0);

  const byColumn = (() => {
    const map = new Map<string, BoardCardData[]>();
    for (const col of columns) map.set(col.id, []);
    for (const c of cards) {
      if (activeFilterCount === 0 || passesFilters(c, filters)) {
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
    router.push(`/p/${projectId}/b/${boardKind}?card=${id}`, { scroll: false });
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
      const lastPos = columns[columns.length - 1]?.position ?? null;
      setColumns((prev) => [
        ...prev,
        {
          id: res.data.columnId,
          name,
          position: generateKeyBetween(lastPos, null),
        },
      ]);
    });
  };

  const persistMove = (
    cardId: string,
    toColumnId: string,
    position: string,
  ) => {
    const fd = new FormData();
    fd.set("cardId", cardId);
    fd.set("toColumnId", toColumnId);
    fd.set("position", position);
    startTransition(async () => {
      const res = await moveCard(fd);
      if (!res.ok) {
        pushToast({ message: res.error });
        router.refresh();
      }
    });
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeCard = cards.find((c) => c.id === String(active.id));
    if (!activeCard) return;

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
      insertAt =
        sourceIndex < targetIndex && activeCard.columnId !== targetColumnId
          ? Math.max(0, targetIndex - 1)
          : targetIndex;
      targetList.splice(insertAt, 0, activeCard);
      finalList = targetList;
    }

    const before = finalList[insertAt - 1]?.position ?? null;
    const after = finalList[insertAt + 1]?.position ?? null;
    const newPosition = generateKeyBetween(before, after);

    setCards((prev) =>
      prev.map((c) =>
        c.id === activeCard.id
          ? { ...c, columnId: targetColumnId, position: newPosition }
          : c,
      ),
    );
    persistMove(activeCard.id, targetColumnId, newPosition);
  };

  return (
    <div className="space-y-3">
      {filterLabels.length > 0 || filterMembers.length > 0 ? (
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          labels={filterLabels}
          members={filterMembers}
          activeCount={activeFilterCount}
        />
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={onDragEnd}
      >
        {boardKind === "ideas" && (
          <div className="flex items-center justify-end">
            <button
              onClick={() => setSortByScore((s) => !s)}
              aria-pressed={sortByScore}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                sortByScore
                  ? "border-accent bg-accent/15 text-text"
                  : "border-border text-muted hover:text-text",
              )}
            >
              Sort by score
            </button>
          </div>
        )}
        <div className="-mx-4 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
          {columns.map((col) => (
            <Column
              key={col.id}
              column={col}
              siblings={columns}
              cards={byColumn.get(col.id) ?? []}
              onOpenCard={openCard}
              showScore={boardKind === "ideas"}
            />
          ))}
          <AddColumn onAdd={addColumn} />
        </div>
      </DndContext>
    </div>
  );
}
