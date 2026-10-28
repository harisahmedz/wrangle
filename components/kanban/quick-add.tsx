"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { listProjectsForQuickAdd } from "@/lib/actions/projects";
import { mutate } from "@/lib/mutations";
import { uuidv7 } from "@/lib/uuid";
import {
  parseQuickAddTitle,
  type QuickAddParse,
  type QuickAddProjectOption,
} from "@/lib/kanban/quick-add-parse";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { CloseIcon } from "@/components/icons";
import { PRIORITY_CHIP_CLASS } from "@/lib/kanban/priority";
import { cn } from "@/lib/utils";

const PROJECT_PATH_RE = /^\/p\/([^/]+)/;

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function QuickAddSheet({
  defaultOpen = false,
  initialTitle = "",
  onClose,
}: {
  defaultOpen?: boolean;
  initialTitle?: string;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [title, setTitle] = useState(initialTitle);
  // Only live-parse once the user has actually edited the field — a
  // share-target prefill (Today's "Share to Wrangle" → initialTitle) is
  // arbitrary shared text, not something the user typed with Quick Add's
  // date/#project syntax in mind, so it shouldn't get silently stripped or
  // redirected to a different project on submit.
  const [dirty, setDirty] = useState(false);
  const [pickedProjectId, setPickedProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<QuickAddProjectOption[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [, startLoadTransition] = useTransition();
  const loadStartedRef = useRef(false);
  const pushToast = useToast();
  const pathname = usePathname();
  const tz = useMemo(() => detectTimezone(), []);

  useEffect(() => {
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail) setTitle(detail);
      setDirty(false);
      setOpen(true);
    };
    window.addEventListener("wrangle-quickadd", onEvent);
    return () => window.removeEventListener("wrangle-quickadd", onEvent);
  }, []);

  useEffect(() => {
    if (!open || loadStartedRef.current) return;
    loadStartedRef.current = true;
    startLoadTransition(async () => {
      try {
        const res = await listProjectsForQuickAdd();
        if (res.ok) {
          setProjects(res.data);
          setProjectsError(null);
        } else {
          setProjectsError(res.error);
        }
      } catch {
        setProjectsError("Couldn't load your projects.");
      } finally {
        setProjectsLoaded(true);
      }
    });
  }, [open, startLoadTransition]);

  // The current project when Quick Add is opened from a board (`/p/<id>/…`),
  // but only if it's one `listProjectsForQuickAdd` actually returned (it
  // excludes viewer-role and archived projects, which `createCardForProject`
  // would reject anyway) — My Space otherwise. Pathname-derived rather than
  // threaded through props because this sheet is mounted once, globally, in
  // bottom-tabs.tsx.
  const pathProjectId = PROJECT_PATH_RE.exec(pathname ?? "")?.[1] ?? null;
  const pathProjectUsable = pathProjectId !== null && projects.some((p) => p.id === pathProjectId);
  const personalProjectId = projects.find((p) => p.isPersonal)?.id ?? null;
  const defaultProjectId = (pathProjectUsable ? pathProjectId : null) ?? personalProjectId ?? null;

  const parsed = useMemo<QuickAddParse>(() => {
    if (!dirty) {
      const trimmed = title.trim();
      return {
        cleanTitle: trimmed,
        dateStrippedTitle: title,
        dueAt: null,
        isAllDay: false,
        dueLabel: null,
        project: null,
        projectToken: null,
        projectUnknown: false,
        priority: null,
        priorityStrippedTitle: title,
      };
    }
    return parseQuickAddTitle(title, { tz, projects });
  }, [dirty, title, tz, projects]);

  // A live "#project" token wins over a manual footer pick — it's the most
  // recent expression of intent.
  const targetProjectId = parsed.project?.id ?? pickedProjectId ?? defaultProjectId;
  const targetProject = projects.find((p) => p.id === targetProjectId) ?? null;

  const close = () => {
    setTitle("");
    setDirty(false);
    setPickedProjectId(null);
    setError(null);
    setOpen(false);
    // Only retry the project fetch next open if it failed — a successful
    // load stays cached for the sheet's lifetime (same as the Dump's
    // category/topic selects).
    if (projectsError) {
      loadStartedRef.current = false;
      setProjectsLoaded(false);
      setProjectsError(null);
    }
    onClose?.();
  };

  const handOffToDump = () => {
    window.dispatchEvent(
      new CustomEvent("wrangle-dump", { detail: title.trim() }),
    );
    close();
  };

  const clearDate = () => setTitle(parsed.dateStrippedTitle);
  const clearPriority = () => setTitle(parsed.priorityStrippedTitle);

  const submit = () => {
    const trimmed = parsed.cleanTitle;
    if (!trimmed || pending || !projectsLoaded || !targetProjectId) return;
    startTransition(async () => {
      const res = await mutate({
        kind: "card.create",
        id: uuidv7(),
        target: { projectId: targetProjectId, boardKind: "todo" },
        title: trimmed,
        dueAt: parsed.dueAt ? parsed.dueAt.toISOString() : null,
        isAllDay: parsed.isAllDay,
        // "p4" means "no priority", same as not typing a token at all.
        priority: parsed.priority === 4 ? null : parsed.priority,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      pushToast({
        message: `Added “${trimmed}” to ${targetProject?.name ?? "project"}`,
      });
      close();
    });
  };

  return (
    <Sheet open={open} onClose={close} label="Quick add" className="sm:max-w-lg">
      <h2 className="mb-3 text-lg font-semibold">Quick add</h2>
      <input
        autoFocus
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          setDirty(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") close();
        }}
        placeholder="What needs doing? Try “tomorrow 5pm #project”"
        aria-label="Task title"
        className="h-14 w-full rounded-lg border border-border bg-surface-2 px-3 text-lg"
        maxLength={300}
      />

      {(parsed.dueLabel || parsed.priority || parsed.projectUnknown) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {parsed.dueLabel && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 py-1 pl-3 pr-1.5 text-xs font-medium text-accent-strong">
              {parsed.dueLabel}
              <button
                type="button"
                onClick={clearDate}
                aria-label="Remove date"
                className="rounded-full p-0.5 text-accent-strong/70 hover:bg-accent/20 hover:text-accent-strong"
              >
                <CloseIcon className="h-3 w-3" />
              </button>
            </span>
          )}
          {parsed.priority && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1.5 text-xs font-medium",
                PRIORITY_CHIP_CLASS[parsed.priority],
              )}
            >
              P{parsed.priority}
              <button
                type="button"
                onClick={clearPriority}
                aria-label="Remove priority"
                className="rounded-full p-0.5 hover:bg-black/10"
              >
                <CloseIcon className="h-3 w-3" />
              </button>
            </span>
          )}
          {parsed.projectUnknown && (
            <span className="text-xs text-muted">
              No project matches “{parsed.projectToken}”
            </span>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      {projectsError && (
        <p className="mt-2 text-sm text-danger">
          {projectsError} Close and reopen Quick Add to retry.
        </p>
      )}

      <button type="button" onClick={handOffToDump} className="mt-3 text-sm text-muted hover:text-text">
        Sort this in the Dump
      </button>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <select
          value={targetProjectId ?? ""}
          onChange={(e) => setPickedProjectId(e.target.value || null)}
          disabled={!!parsed.project || !projectsLoaded}
          aria-label="Project"
          className="h-10 max-w-[50%] rounded-md border border-border bg-surface-2 px-2 text-sm disabled:opacity-60"
        >
          {projects.length === 0 && <option value="">My Space</option>}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={pending || !parsed.cleanTitle || !projectsLoaded || !targetProjectId}
          >
            {pending ? "Adding…" : "Add task"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
