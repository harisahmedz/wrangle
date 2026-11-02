"use client";

// Sidebar drag-reorder, loaded lazily by project-nav.tsx (V3 S8b) so dnd-kit
// stays out of the shell's first load. The board keeps its own dnd-kit.
import type { CSSProperties, ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export type SortableBits = {
  setNodeRef: (el: HTMLElement | null) => void;
  setActivatorNodeRef: (el: HTMLElement | null) => void;
  handleProps: Record<string, unknown>;
  style: CSSProperties;
  isDragging: boolean;
};

function SortableItem({
  id,
  render,
}: {
  id: string;
  render: (bits: SortableBits) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return render({
    setNodeRef,
    setActivatorNodeRef,
    handleProps: { ...attributes, ...listeners },
    style: { transform: CSS.Transform.toString(transform), transition },
    isDragging,
  });
}

export function SortableProjectList({
  ids,
  onMove,
  renderRow,
}: {
  ids: string[];
  onMove: (activeId: string, overId: string) => void;
  renderRow: (id: string, bits: SortableBits) => ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onMove(String(active.id), String(over.id));
  };

  return (
    <DndContext
      id="sidebar-projects"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {ids.map((id) => (
          <SortableItem key={id} id={id} render={(bits) => renderRow(id, bits)} />
        ))}
      </SortableContext>
    </DndContext>
  );
}
