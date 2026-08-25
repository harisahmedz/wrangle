"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
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
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { moveProject, reorderProject } from "@/lib/actions/projects";
import { reorderById } from "@/lib/order";
import { cn } from "@/lib/utils";

export type SidebarProject = {
  id: string;
  name: string;
  emoji: string | null;
  color: string | null;
  isPersonal: boolean;
  archivedAt: Date | null;
  role: "owner" | "admin" | "member" | "viewer";
  position: string;
};

function canManage(role: SidebarProject["role"]) {
  return role === "owner" || role === "admin";
}

function ProjectRow({
  project,
  active,
  showControls,
}: {
  project: SidebarProject;
  active: boolean;
  showControls: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });

  const move = (direction: "up" | "down") => {
    const fd = new FormData();
    fd.set("projectId", project.id);
    fd.set("direction", direction);
    startTransition(async () => {
      await moveProject(fd);
    });
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn("group relative", isDragging && "opacity-40")}
    >
      <Link
        href={`/p/${project.id}`}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors",
          active
            ? "bg-surface-2 font-medium text-text"
            : "text-muted hover:bg-surface-2 hover:text-text",
          pending && "opacity-60",
        )}
      >
        <span
          aria-hidden
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-sm"
          style={{
            backgroundColor: project.color ? `${project.color}22` : undefined,
          }}
        >
          {project.emoji ?? "📁"}
        </span>
        {showControls && (
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Reorder ${project.name}`}
            title="Drag to reorder"
            className="shrink-0 cursor-grab touch-none select-none text-[10px] leading-none text-muted opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
          >
            ⋮⋮
          </button>
        )}
        <span className="truncate">{project.name}</span>
        {project.isPersonal && (
          <span className="ml-auto rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
            home
          </span>
        )}
      </Link>
      {showControls && (
        <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 flex-col group-hover:flex">
          <button
            onClick={() => move("up")}
            aria-label={`Move ${project.name} up`}
            className="h-4 w-5 rounded bg-surface text-[10px] leading-none text-muted hover:text-text"
          >
            ▲
          </button>
          <button
            onClick={() => move("down")}
            aria-label={`Move ${project.name} down`}
            className="h-4 w-5 rounded bg-surface text-[10px] leading-none text-muted hover:text-text"
          >
            ▼
          </button>
        </div>
      )}
    </div>
  );
}

function ProjectList({
  projects,
  pathname,
}: {
  projects: SidebarProject[];
  pathname: string;
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
    const result = reorderById(projects, String(active.id), String(over.id));
    if (!result) return;
    const fd = new FormData();
    fd.set("projectId", result.id);
    fd.set("position", result.position);
    void reorderProject(fd);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={projects.map((p) => p.id)}
        strategy={verticalListSortingStrategy}
      >
        {projects.map((p) => (
          <ProjectRow
            key={p.id}
            project={p}
            active={
              pathname === `/p/${p.id}` || pathname.startsWith(`/p/${p.id}/`)
            }
            showControls={canManage(p.role)}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}

export function SideProjects({ projects }: { projects: SidebarProject[] }) {
  const pathname = usePathname();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);

  const visible = projects.filter((p) => !p.archivedAt);
  const archived = projects.filter((p) => p.archivedAt);

  return (
    <aside className="hidden w-64 shrink-0 flex-col gap-1 border-l border-border bg-surface/40 p-3 md:flex">
      <p className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-muted">
        Projects
      </p>
      <nav className="flex flex-col gap-0.5">
        <ProjectList projects={visible} pathname={pathname} />
      </nav>
      <button
        onClick={() => setDialogOpen(true)}
        className="mt-1 flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-muted transition-colors hover:bg-surface-2 hover:text-text"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-sm border border-dashed border-border">
          +
        </span>
        New project
      </button>

      {archived.length > 0 && (
        <div className="mt-auto border-t border-border pt-2">
          <button
            onClick={() => setArchivedOpen((o) => !o)}
            aria-expanded={archivedOpen}
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted hover:text-text"
          >
            Archived ({archived.length})
            <span>{archivedOpen ? "▾" : "▸"}</span>
          </button>
          {archivedOpen && (
            <nav className="mt-1 flex flex-col gap-0.5 opacity-70">
              <ProjectList projects={archived} pathname={pathname} />
            </nav>
          )}
        </div>
      )}

      <Link
        href="/trash"
        className="px-2 py-1.5 text-xs text-muted hover:text-text"
      >
        Trash
      </Link>

      <NewProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </aside>
  );
}
