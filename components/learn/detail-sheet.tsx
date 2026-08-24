"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addLearningNote,
  addMilestone,
  addResource,
  addSession,
  deleteLearningItem,
  deleteLearningNote,
  deleteMilestone,
  deleteResource,
  deleteSession,
  linkItemToBoard,
  restoreLearningItem,
  toggleMilestone,
  updateLearningItem,
} from "@/lib/actions/learning";
import { Sheet } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type { LearnItemRow } from "@/components/learn/types";

type Milestone = { id: string; text: string; isDone: boolean };
type Session = { id: string; happenedOn: string; minutes: number; note: string | null };
type Resource = { id: string; url: string; title: string | null };
type Note = { id: string; body: string; createdAt: string };

export function LearnDetailSheet({
  projectIdBase,
  item,
  milestones,
  sessions,
  resources,
  notes,
  projects,
  todayKey,
}: {
  projectIdBase: string;
  item: LearnItemRow;
  milestones: Milestone[];
  sessions: Session[];
  resources: Resource[];
  notes: Note[];
  projects: Array<{ id: string; name: string }>;
  todayKey: string;
}) {
  const router = useRouter();
  const pushToast = useToast();
  const close = () => router.push(projectIdBase, { scroll: false });

  const [title, setTitle] = useState(item.title);
  const [type, setType] = useState(item.type);
  const [status, setStatus] = useState(item.status);
  const [sourceUrl, setSourceUrl] = useState(item.sourceUrl ?? "");
  const [whyNote, setWhyNote] = useState(item.whyNote ?? "");
  const [targetDate, setTargetDate] = useState(item.targetDate ?? "");
  const [sessionMinutes, setSessionMinutes] = useState("");
  const [sessionDate, setSessionDate] = useState(todayKey);
  const [boardProject, setBoardProject] = useState(projects[0]?.id ?? "");
  const [, startTransition] = useTransition();

  const run = (fn: (fd: FormData) => Promise<{ ok: boolean; error?: string }>, fd: FormData, after?: () => void) => {
    startTransition(async () => {
      const res = await fn(fd);
      if (!res.ok) pushToast({ message: res.error ?? "Something went wrong" });
      else after?.();
    });
  };

  const saveMeta = () => {
    const fd = new FormData();
    fd.set("itemId", item.id);
    fd.set("title", title.trim());
    fd.set("type", type);
    fd.set("status", status);
    fd.set("sourceUrl", sourceUrl.trim());
    fd.set("whyNote", whyNote.trim());
    fd.set("targetDate", targetDate);
    run(updateLearningItem, fd);
  };

  const remove = () => {
    const fd = new FormData();
    fd.set("itemId", item.id);
    startTransition(async () => {
      await deleteLearningItem(fd);
      close();
      pushToast({
        message: "Deleted from tracker",
        actionLabel: "Undo",
        onAction: () => {
          const undoFd = new FormData();
          undoFd.set("itemId", item.id);
          void restoreLearningItem(undoFd);
        },
      });
    });
  };

  const addToBoard = () => {
    if (!boardProject) return;
    const fd = new FormData();
    fd.set("itemId", item.id);
    fd.set("projectId", boardProject);
    startTransition(async () => {
      const res = await linkItemToBoard(fd);
      if (!res.ok) {
        pushToast({ message: res.error });
        return;
      }
      pushToast({
        message: "Card created on To-Do → Backlog",
        actionLabel: "View",
        onAction: () =>
          router.push(`/p/${res.data.projectId}/b/todo?card=${res.data.cardId}`),
      });
    });
  };

  const totalMinutes = sessions.reduce((s, x) => s + x.minutes, 0);

  return (
    <Sheet open variant="side" onClose={close} label="Learning item">
      <div className="space-y-5">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold leading-tight break-words">{item.title}</h2>
          <button onClick={close} aria-label="Close" className="rounded-md px-2 py-1 text-muted hover:bg-surface-2 hover:text-text">
            ✕
          </button>
        </div>

        <div className="flex items-center gap-3 rounded-lg bg-surface-2/60 p-3 text-sm">
          <span><span className="text-muted">Hours:</span> <span className="font-semibold tabular-nums">{item.hoursLogged}</span></span>
          <span><span className="text-muted">Progress:</span> <span className="font-semibold tabular-nums">{item.progressPct}%</span></span>
          <span className="ml-auto capitalize text-muted">{item.status}</span>
        </div>

        <section className="space-y-2">
          <p className="text-sm font-medium">Details</p>
          <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" maxLength={200} className="h-9 w-full rounded-md border border-border bg-surface-2 px-2 text-sm" />
          <div className="flex gap-2">
            <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type" className="h-9 flex-1 rounded-md border border-border bg-surface-2 px-1.5 text-sm capitalize">
              {["course", "book", "video", "article", "skill", "other"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status" className="h-9 flex-1 rounded-md border border-border bg-surface-2 px-1.5 text-sm capitalize">
              {["want", "learning", "learned"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://source…" inputMode="url" aria-label="Source URL" className="h-9 w-full rounded-md border border-border bg-surface-2 px-2 text-sm" />
          <textarea value={whyNote} onChange={(e) => setWhyNote(e.target.value)} placeholder="Why this matters…" rows={2} aria-label="Why note" className="w-full resize-none rounded-md border border-border bg-surface-2 p-2 text-sm" />
          <div className="flex items-center gap-2 text-sm text-muted">
            Target
            <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} aria-label="Target date" className="h-9 flex-1 rounded-md border border-border bg-surface-2 px-2" />
          </div>
          <button onClick={saveMeta} className="w-full rounded-md border border-border py-2 text-sm font-medium hover:bg-surface-2">
            Save details
          </button>
        </section>

        <section className="space-y-2">
          <p className="text-sm font-medium">Log a session</p>
          <div className="flex gap-2">
            <input type="number" min={1} max={1440} value={sessionMinutes} onChange={(e) => setSessionMinutes(e.target.value)} placeholder="min" aria-label="Minutes" className="h-9 w-20 rounded-md border border-border bg-surface-2 px-2 text-sm tabular-nums" />
            <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} aria-label="Session date" className="h-9 flex-1 rounded-md border border-border bg-surface-2 px-2 text-sm" />
            <button
              onClick={() => {
                if (!Number(sessionMinutes)) return;
                const fd = new FormData();
                fd.set("itemId", item.id);
                fd.set("happenedOn", sessionDate);
                fd.set("minutes", sessionMinutes);
                run(addSession, fd, () => setSessionMinutes(""));
              }}
              disabled={!Number(sessionMinutes)}
              className="rounded-md bg-accent px-3 text-sm font-medium text-accent-fg disabled:opacity-50"
            >
              Log
            </button>
          </div>
          <ul className="max-h-32 space-y-1 overflow-y-auto">
            {sessions.map((s) => (
              <li key={s.id} className="group flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-surface-2">
                <span className="tabular-nums text-muted">
                  {s.happenedOn}
                </span>
                <span className="font-medium tabular-nums">{s.minutes}m</span>
                {s.note && <span className="truncate text-muted">{s.note}</span>}
                <button
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("sessionId", s.id);
                    run(deleteSession, fd);
                  }}
                  aria-label="Delete session"
                  className="ml-auto text-muted opacity-0 group-hover:opacity-100 hover:text-danger"
                >
                  ✕
                </button>
              </li>
            ))}
            {sessions.length === 0 && <li className="px-1 text-xs text-muted">No sessions yet — honest hours only.</li>}
          </ul>
          {totalMinutes > 0 && (
            <p className="text-[11px] text-muted">
              {(totalMinutes / 60).toFixed(1)}h across {sessions.length} session{sessions.length === 1 ? "" : "s"}
            </p>
          )}
        </section>

        <section className="space-y-2">
          <p className="text-sm font-medium">Milestones</p>
          <ul className="space-y-1">
            {milestones.map((m) => (
              <li key={m.id} className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-surface-2">
                <button
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("milestoneId", m.id);
                    run(toggleMilestone, fd);
                  }}
                  aria-pressed={m.isDone}
                  aria-label={`Toggle ${m.text}`}
                  className={
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] " +
                    (m.isDone ? "border-emerald-500 bg-emerald-500 text-white" : "border-border hover:border-accent")
                  }
                >
                  {m.isDone && "✓"}
                </button>
                <span className={"flex-1 text-sm " + (m.isDone ? "text-muted line-through" : "")}>{m.text}</span>
                <button
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("milestoneId", m.id);
                    run(deleteMilestone, fd);
                  }}
                  aria-label={`Delete ${m.text}`}
                  className="text-xs text-muted opacity-0 group-hover:opacity-100 hover:text-danger"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <MilestoneInput itemId={item.id} onAdd={addMilestone} />
          {milestones.length > 0 && (
            <p className="text-[11px] text-muted">Progress auto-derives from milestones.</p>
          )}
        </section>

        <section className="space-y-2">
          <p className="text-sm font-medium">Resources & notes journal</p>
          <ul className="space-y-1">
            {resources.map((r) => (
              <li key={r.id} className="group flex items-center gap-2 text-xs">
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate underline-offset-2 hover:underline">
                  {r.title || r.url}
                </a>
                <button
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("resourceId", r.id);
                    run(deleteResource, fd);
                  }}
                  aria-label="Delete resource"
                  className="text-muted opacity-0 group-hover:opacity-100 hover:text-danger"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <ResourceInput itemId={item.id} onAdd={addResource} />

          <ul className="space-y-2 pt-2">
            {notes.map((n) => (
              <li key={n.id} className="group rounded-md border border-border bg-surface-2/50 p-2 text-xs">
                <p className="whitespace-pre-wrap break-words">{n.body}</p>
                <div className="mt-1 flex justify-between text-[10px] text-muted">
                  <span>{new Date(n.createdAt).toLocaleDateString()}</span>
                  <button
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("noteId", n.id);
                      run(deleteLearningNote, fd);
                    }}
                    className="opacity-0 group-hover:opacity-100 hover:text-danger"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <NoteInput itemId={item.id} onAdd={addLearningNote} />
        </section>

        <section className="space-y-2 rounded-lg border border-dashed border-border p-3">
          <p className="text-sm font-medium">Add to a project board</p>
          <div className="flex gap-2">
            <select value={boardProject} onChange={(e) => setBoardProject(e.target.value)} aria-label="Project" className="h-9 min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-1.5 text-sm">
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button onClick={addToBoard} disabled={!boardProject} className="rounded-md bg-accent px-3 text-sm font-medium text-accent-fg disabled:opacity-50">
              Create card
            </button>
          </div>
        </section>

        <div className="flex justify-between border-t border-border pt-4">
          <button onClick={remove} className="text-sm text-danger hover:underline">
            Delete
          </button>
          <button onClick={close} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-surface-2">
            Close
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function MilestoneInput({
  itemId,
  onAdd,
}: {
  itemId: string;
  onAdd: (fd: FormData) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [text, setText] = useState("");
  return (
    <div className="flex gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && text.trim()) {
            const fd = new FormData();
            fd.set("itemId", itemId);
            fd.set("text", text.trim());
            void onAdd(fd);
            setText("");
          }
        }}
        placeholder="+ Add milestone…"
        aria-label="New milestone"
        className="h-8 w-full rounded-md border border-border bg-surface-2 px-2 text-sm"
      />
    </div>
  );
}

function ResourceInput({
  itemId,
  onAdd,
}: {
  itemId: string;
  onAdd: (fd: FormData) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [url, setUrl] = useState("");
  const [, startTransition] = useTransition();
  return (
    <input
      value={url}
      onChange={(e) => setUrl(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && /^https?:\/\//i.test(url.trim())) {
          const fd = new FormData();
          fd.set("itemId", itemId);
          fd.set("url", url.trim());
          startTransition(async () => {
            const res = await onAdd(fd);
            if (res.ok) setUrl("");
          });
        }
      }}
      placeholder="+ Paste resource URL, press Enter…"
      inputMode="url"
      aria-label="New resource URL"
      className="h-8 w-full rounded-md border border-border bg-surface-2 px-2 text-sm"
    />
  );
}

function NoteInput({
  itemId,
  onAdd,
}: {
  itemId: string;
  onAdd: (fd: FormData) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [body, setBody] = useState("");
  const [, startTransition] = useTransition();
  return (
    <textarea
      value={body}
      onChange={(e) => setBody(e.target.value)}
      rows={2}
      placeholder="Journal note… (⌘↵ to save)"
      aria-label="New journal note"
      className="w-full resize-none rounded-md border border-border bg-surface-2 p-2 text-sm"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim()) {
          const fd = new FormData();
          fd.set("itemId", itemId);
          fd.set("body", body.trim());
          startTransition(async () => {
            const res = await onAdd(fd);
            if (res.ok) setBody("");
          });
        }
      }}
    />
  );
}
