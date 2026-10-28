"use client";

import { useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { generateKeyBetween } from "fractional-indexing";
import type { BoardKind } from "@/db/schema";
import { BoardTabs } from "@/components/kanban/board-tabs";
import { InlineAdd } from "@/components/kanban/inline-add";
import { TaskRow } from "@/components/tasks/task-row";
import { formatDueLabel } from "@/components/tasks/due-label";
import { GripIcon } from "@/components/icons";
import { useToast } from "@/components/ui/toast";
import { mutate } from "@/lib/mutations";
import { uuidv7 } from "@/lib/uuid";
import { passesFilters } from "@/lib/kanban/filters";
import { buildListGroups, reorderEnabledFor } from "@/lib/kanban/list-groups";
import { parseBoardFilters } from "@/lib/kanban/types";
import type { BoardCardData, BoardColumnData, BoardSearchRecord } from "@/lib/kanban/types";
import type { GroupBy, SortMode } from "@/lib/validation/prefs";

type Props = {
  projectId: string;
  boardKind: BoardKind;
  columns: BoardColumnData[];
  cards: BoardCardData[];
  canEdit: boolean;
  toolbarEnd: ReactNode;
  viewMenu: ReactNode;
  timeZone: string;
  groupBy: GroupBy;
  sort: SortMode;
  showCompleted: boolean;
};

export function ListView({
  projectId,
  boardKind,
  columns,
  cards: serverCards,
  canEdit,
  toolbarEnd,
  viewMenu,
  timeZone,
  groupBy,
  sort,
  showCompleted,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pushToast = useToast();
  const [cards, setCards] = useState(serverCards);
  const [syncedCards, setSyncedCards] = useState(serverCards);
  const [pendingComplete, setPendingComplete] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  if (syncedCards !== serverCards) {
    setSyncedCards(serverCards);
    setCards(serverCards);
  }

  const spRecord = useMemo<BoardSearchRecord>(() => {
    const rec: BoardSearchRecord = {};
    for (const key of new Set(searchParams.keys())) {
      const all = searchParams.getAll(key);
      rec[key] = all.length > 1 ? all : all[0];
    }
    return rec;
  }, [searchParams]);
  const filters = useMemo(() => parseBoardFilters(spRecord), [spRecord]);
  const activeFilterCount =
    (filters.q ? 1 : 0) +
    filters.labelIds.length +
    filters.assigneeIds.length +
    (filters.due !== null ? 1 : 0);

  const visibleCards = useMemo(() => {
    return cards.filter((c) => {
      if (!showCompleted && c.completedAt !== null) return false;
      if (activeFilterCount === 0) return true;
      return passesFilters(c, filters, timeZone);
    });
  }, [cards, filters, activeFilterCount, showCompleted, timeZone]);

  const groups = useMemo(
    () => buildListGroups(visibleCards, columns, groupBy, sort, timeZone),
    [visibleCards, columns, groupBy, sort, timeZone],
  );

  // Same gating as BoardView: active filters (or score-sort there) make
  // "insert at this index" ambiguous, since the list on screen isn't the
  // full, stored order.
  const reorderEnabled = canEdit && activeFilterCount === 0 && reorderEnabledFor(groupBy, sort);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const cardHref = (cardId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("card", cardId);
    return `/p/${projectId}/b/${boardKind}?${params.toString()}`;
  };

  const toggleComplete = (card: BoardCardData) => {
    if (!canEdit || pendingComplete.has(card.id)) return;

    const completed = card.completedAt === null;
    const completedAt = completed ? new Date().toISOString() : null;
    setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, completedAt } : c)));
    setPendingComplete((prev) => new Set(prev).add(card.id));

    startTransition(() => {
      mutate({ kind: "card.complete", cardId: card.id, completed })
        .then((res) => {
          if (!res.ok) {
            pushToast({ message: res.error });
            router.refresh();
          }
        })
        .finally(() => {
          setPendingComplete((prev) => {
            const next = new Set(prev);
            next.delete(card.id);
            return next;
          });
        });
    });
  };

  const addCard = async (columnId: string, title: string): Promise<boolean> => {
    if (!canEdit) return false;
    const res = await mutate({ kind: "card.create", id: uuidv7(), target: { columnId }, title });
    if (!res.ok) {
      pushToast({ message: res.error });
      return false;
    }
    return true;
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (!reorderEnabled) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeCard = cards.find((c) => c.id === String(active.id));
    if (!activeCard) return;

    const overIsGroup = groups.some((g) => g.id === String(over.id));
    const targetGroup = overIsGroup
      ? groups.find((g) => g.id === String(over.id))
      : groups.find((g) => g.cards.some((c) => c.id === String(over.id)));
    if (!targetGroup || targetGroup.columnId === null) return;
    const targetIndex = overIsGroup
      ? targetGroup.cards.length
      : targetGroup.cards.findIndex((c) => c.id === String(over.id));
    if (targetIndex === -1) return;
    const targetColumnId = targetGroup.columnId;

    const sourceGroup = groups.find((g) => g.cards.some((c) => c.id === activeCard.id));

    let finalList: BoardCardData[];
    const insertAt = targetIndex;
    if (sourceGroup === targetGroup) {
      finalList = [...targetGroup.cards];
      const sourceIndex = finalList.findIndex((c) => c.id === activeCard.id);
      finalList.splice(sourceIndex, 1);
      finalList.splice(insertAt, 0, activeCard);
    } else {
      finalList = [...targetGroup.cards];
      finalList.splice(insertAt, 0, activeCard);
    }

    const before = finalList[insertAt - 1]?.position ?? null;
    const after = finalList[insertAt + 1]?.position ?? null;
    const newPosition = generateKeyBetween(before, after);

    // Set, not toggle (mirrors moveCard's own auto-complete rule, actions.ts):
    // dropping into a Done column completes the card; dropping out reopens it.
    const targetColumn = columns.find((c) => c.id === targetColumnId);
    const completedAt = targetColumn?.isDone
      ? (activeCard.completedAt ?? new Date().toISOString())
      : null;

    setCards((prev) =>
      prev.map((c) =>
        c.id === activeCard.id
          ? { ...c, columnId: targetColumnId, position: newPosition, completedAt }
          : c,
      ),
    );
    startTransition(() => {
      void mutate({
        kind: "card.move",
        cardId: activeCard.id,
        toColumnId: targetColumnId,
        position: newPosition,
      }).then((res) => {
        if (!res.ok) {
          pushToast({ message: res.error });
          router.refresh();
        }
      });
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <BoardTabs projectId={projectId} active={boardKind} />
        <div className="flex w-full items-center gap-2 sm:w-auto">
          {viewMenu}
          {toolbarEnd}
        </div>
      </div>

      {!reorderEnabled && canEdit && (
        <p className="text-xs text-muted">
          {activeFilterCount > 0
            ? "Clear filters to reorder."
            : "Switch to Column grouping and Manual sort to reorder."}
        </p>
      )}

      <DndContext id="list" sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.id}>
              <div className="mb-1 flex items-baseline gap-2 px-1">
                <h2 className="text-sm font-semibold">{group.name}</h2>
                <span className="text-xs tabular-nums text-muted">{group.cards.length}</span>
              </div>
              <SortableContext items={group.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                <GroupDropZone id={group.id}>
                  {group.cards.map((card) => (
                    <SortableTaskRow
                      key={card.id}
                      card={card}
                      href={cardHref(card.id)}
                      timeZone={timeZone}
                      canEdit={canEdit}
                      reorderEnabled={reorderEnabled}
                      onToggle={() => toggleComplete(card)}
                    />
                  ))}
                </GroupDropZone>
              </SortableContext>
              {/* Due-date groups are synthetic buckets, not a real column choice —
                  an inline add here would silently create an undated card in
                  whichever column `fallbackColumnId` picked. Hidden until there's
                  a real "due date" to assign (see lib/kanban/list-groups.ts). */}
              {canEdit && group.columnId && groupBy !== "due" && (
                <InlineAdd onAdd={(title) => addCard(group.columnId!, title)} />
              )}
            </section>
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function GroupDropZone({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <ul ref={setNodeRef} data-group-id={id} className="min-h-2">
      {children}
    </ul>
  );
}

function SortableTaskRow({
  card,
  href,
  timeZone,
  canEdit,
  reorderEnabled,
  onToggle,
}: {
  card: BoardCardData;
  href: string;
  timeZone: string;
  canEdit: boolean;
  reorderEnabled: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, disabled: !reorderEnabled });
  const completed = card.completedAt !== null;
  // eslint-disable-next-line react-hooks/purity -- freshness per render is intended for due badges
  const overdue = !completed && card.dueAt !== null && new Date(card.dueAt).getTime() < Date.now();
  const due = card.dueAt ? formatDueLabel(new Date(card.dueAt), overdue, timeZone) : undefined;

  return (
    <TaskRow
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : undefined,
      }}
      title={card.title}
      href={href}
      completed={completed}
      onToggle={canEdit ? onToggle : undefined}
      priority={card.priority}
      due={due}
      dragHandle={
        reorderEnabled ? (
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Reorder ${card.title}`}
            className="flex h-11 w-11 shrink-0 cursor-grab touch-none items-center justify-center text-muted active:cursor-grabbing"
          >
            <GripIcon className="h-4 w-4" />
          </button>
        ) : undefined
      }
    />
  );
}
