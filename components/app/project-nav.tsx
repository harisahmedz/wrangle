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
import { ChevronRightIcon, GripIcon } from "@/components/icons";

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

function ProjectRow({
  project,
  active,
  onNavigate,
}: {
  project: SidebarProject;
  active: boolean;
  onNavigate?: () => void;
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
      className={cn(
        "group relative flex items-center rounded-md",
        active ? "bg-surface-2" : "hover:bg-surface-2",
        isDragging && "opacity-40",
      )}
    >
      <Link
        href={`/p/${project.id}`}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors",
          active ? "font-medium text-text" : "text-muted hover:text-text",
          pending && "opacity-60",
        )}
      >
        <span
          aria-hidden
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-sm"
          style={{
            backgroundColor: project.color
              ? `color-mix(in srgb, ${project.color} 15%, transparent)`
              : undefined,
          }}
        >
          {project.emoji ?? "📁"}
        </span>
        <span className="truncate">{project.name}</span>
        {project.isPersonal && (
          <span className="ml-auto shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted">
            Home
          </span>
        )}
      </Link>
      {/* Overlaid (not a flow sibling) so it costs the row no permanent width.
          Stays in the DOM and toggles via opacity (not display) — opacity-0 +
          pointer-events-none by default so it doesn't steal clicks from the
          row, revealed on hover/focus, and always revealed under
          pointer:coarse since touch has no hover to reveal the drag grip.
          Side-by-side (not stacked) so a 44px coarse-pointer floor on each
          button doesn't balloon into the rows above/below — see ui-system
          §7.7. */}
      <div className="pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md bg-surface-2 pl-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100">
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${project.name}`}
          title="Drag to reorder"
          className="flex h-6 w-6 shrink-0 cursor-grab touch-none select-none items-center justify-center text-muted hover:text-text active:cursor-grabbing"
        >
          <GripIcon className="h-4 w-4" />
        </button>
        <button
          onClick={() => move("up")}
          aria-label={`Move ${project.name} up`}
          className="flex h-5 w-5 items-center justify-center rounded bg-surface text-muted hover:text-text"
        >
          <ChevronRightIcon className="h-3 w-3 -rotate-90" />
        </button>
        <button
          onClick={() => move("down")}
          aria-label={`Move ${project.name} down`}
          className="flex h-5 w-5 items-center justify-center rounded bg-surface text-muted hover:text-text"
        >
          <ChevronRightIcon className="h-3 w-3 rotate-90" />
        </button>
      </div>
    </div>
  );
}

function ProjectList({
  projects,
  pathname,
  onNavigate,
}: {
  projects: SidebarProject[];
  pathname: string;
  onNavigate?: () => void;
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
      id="sidebar-projects"
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
            onNavigate={onNavigate}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}

export function ProjectNav({
  projects,
  onNavigate,
  onRequestNewProject,
}: {
  projects: SidebarProject[];
  onNavigate?: () => void;
  /** When this is rendered inside a Sheet/drawer, pass a callback that closes
   * the sheet and opens the dialog from outside it — a dialog mounted deep
   * inside an already-open Sheet fights it for focus-trap/scroll-lock and
   * survives the post-create router.push. When omitted (the pinned desktop
   * sidebar, with no enclosing sheet), this manages its own dialog. */
  onRequestNewProject?: () => void;
}) {
  const pathname = usePathname();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);

  const visible = projects.filter((p) => !p.archivedAt);
  const archived = projects.filter((p) => p.archivedAt);

  return (
    <div className="flex flex-col gap-1">
      <p className="px-2 pb-1 pt-1 text-sm font-medium text-muted">Projects</p>
      <nav className="flex flex-col gap-1">
        <ProjectList
          projects={visible}
          pathname={pathname}
          onNavigate={onNavigate}
        />
      </nav>
      <button
        onClick={() => {
          if (onRequestNewProject) onRequestNewProject();
          else setDialogOpen(true);
        }}
        className="mt-1 flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-muted transition-colors hover:bg-surface-2 hover:text-text"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-sm border border-dashed border-border">
          +
        </span>
        New project
      </button>

      {archived.length > 0 && (
        <div className="border-t border-border pt-2">
          <button
            onClick={() => setArchivedOpen((o) => !o)}
            aria-expanded={archivedOpen}
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium text-muted hover:text-text"
          >
            Archived ({archived.length})
            <ChevronRightIcon
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                archivedOpen && "rotate-90",
              )}
            />
          </button>
          {archivedOpen && (
            <nav className="mt-1 flex flex-col gap-1 opacity-70">
              <ProjectList
                projects={archived}
                pathname={pathname}
                onNavigate={onNavigate}
              />
            </nav>
          )}
        </div>
      )}

      <Link
        href="/trash"
        onClick={onNavigate}
        aria-current={pathname === "/trash" ? "page" : undefined}
        className={cn(
          "mt-auto flex min-h-11 items-center rounded-md px-2 text-xs",
          pathname === "/trash"
            ? "font-medium text-text"
            : "text-muted hover:text-text",
        )}
      >
        Trash
      </Link>

      {!onRequestNewProject && (
        <NewProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      )}
    </div>
  );
}
