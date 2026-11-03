"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import {
  archiveCard,
  duplicateCard,
  moveCardToBoard,
  restoreCard,
  setCardCover,
} from "@/lib/kanban/actions";
import { mutate } from "@/lib/mutations";
import { useOutbox } from "@/lib/outbox/client";
import { cardPatchOf, completionOf } from "@/lib/outbox/overlay";
import { promoteIdea, updateCardScore } from "@/lib/kanban/phase3-actions";
import { scoreOf, formatScore } from "@/lib/kanban/score";
import { COVER_SWATCHES } from "@/lib/palette";
import { PRIORITY_BUTTON_CLASS, PRIORITY_VALUES, type CardPriority } from "@/lib/kanban/priority";
import { Button } from "@/components/ui/button";
import { CheckIcon, CloseIcon } from "@/components/icons";
import { Modal, Sheet } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  AssigneesSection,
  AttachmentsSection,
  ChecklistSection,
  CommentsSection,
  LabelsSection,
  type AttachmentRow,
  type ChecklistRow,
  type CommentRow,
  type LabelRow,
  type MemberRow,
} from "@/components/kanban/detail-sections";

type CardDetailData = {
  id: string;
  title: string;
  description: string | null;
  descriptionHtml: string;
  dueAt: Date | null;
  isAllDay: boolean;
  completedAt: Date | null;
  impact: number | null;
  effort: number | null;
  /** ROADMAP-V2 S9: 1|2|3|null only (P4 is null — see lib/kanban/priority.ts). */
  priority: CardPriority | null;
  coverColor: string | null;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  projectId: string;
  boardKind: string;
  card: CardDetailData;
  checklist: ChecklistRow[];
  labels: LabelRow[];
  activeLabelIds: string[];
  members: MemberRow[];
  activeAssigneeIds: string[];
  comments: CommentRow[];
  attachments: AttachmentRow[];
  cloudinaryReady: boolean;
  canManageLabels: boolean;
  canEdit: boolean;
  isIdeasBoard?: boolean;
  history?: Array<{ text: string; when: string }>;
  viewerName?: string;
};

const BOARD_LABEL: Record<string, string> = { todo: "To-Do", ideas: "Ideas", work: "Work" };

function toLocalInput(dueAt: Date | null, allDay: boolean): string {
  if (!dueAt) return "";
  const d = new Date(dueAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (allDay) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CardDetail({
  projectId,
  boardKind,
  card,
  checklist,
  labels,
  activeLabelIds,
  members,
  activeAssigneeIds,
  comments,
  attachments,
  cloudinaryReady,
  canManageLabels,
  canEdit,
  isIdeasBoard = false,
  history = [],
  viewerName,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pushToast = useToast();
  const close = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("card");
    const qs = params.toString();
    router.push(`/p/${projectId}/b/${boardKind}${qs ? `?${qs}` : ""}`, {
      scroll: false,
    });
  };

  // The sheet's baseline is the server card with this card's queued
  // `card.update` patches folded in (OFFLINE-OUTBOX §2.3): an edit saved
  // offline is what the user sees on reopen, the dirty check compares
  // against it, and the next patch diffs against it — otherwise reopening
  // after an offline rename would show the old title and "Save & close"
  // would queue the same change twice.
  const { entries: outboxEntries } = useOutbox();
  const queued = cardPatchOf(card.id, outboxEntries);
  const base = {
    title: queued.title ?? card.title,
    description: queued.description !== undefined ? queued.description : card.description,
    dueAt: queued.dueAt !== undefined ? (queued.dueAt ? new Date(queued.dueAt) : null) : card.dueAt,
    isAllDay: queued.isAllDay ?? card.isAllDay,
    priority: queued.priority !== undefined ? queued.priority : card.priority,
  };

  const [title, setTitle] = useState(base.title);
  const [description, setDescription] = useState(base.description ?? "");
  const [allDay, setAllDay] = useState(base.isAllDay);
  const [dueInput, setDueInput] = useState(() =>
    toLocalInput(base.dueAt, base.isAllDay),
  );
  const [priority, setPriority] = useState<CardPriority | null>(base.priority);
  const [pendingSave, startSaveTransition] = useTransition();
  const [, startRemoveTransition] = useTransition();
  const [, startTransition] = useTransition();

  const done = completionOf(card.id, outboxEntries) ?? card.completedAt !== null;
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty =
    canEdit &&
    (title !== base.title ||
      description !== (base.description ?? "") ||
      allDay !== base.isAllDay ||
      dueInput !== toLocalInput(base.dueAt, base.isAllDay) ||
      priority !== base.priority);
  const requestClose = () => {
    if (dirty) setConfirmDiscard(true);
    else close();
  };

  const changeAllDay = (next: boolean) => {
    setAllDay(next);
    setDueInput((v) =>
      next ? v.split("T")[0] : v && v.length === 10 ? `${v}T12:00` : v,
    );
  };

  const save = (thenClose = false) => {
    if (!title.trim()) return;
    let dueIso = "";
    if (dueInput) {
      const d = new Date(allDay ? `${dueInput}T12:00:00` : dueInput);
      if (Number.isNaN(d.getTime())) {
        pushToast({ message: "Invalid date" });
        return;
      }
      dueIso = d.toISOString();
    }
    // §5.2 patch-wins-per-field: send only what changed against the baseline.
    const baseDue = base.dueAt ? new Date(base.dueAt).toISOString() : null;
    const patch: Extract<Parameters<typeof mutate>[0], { kind: "card.update" }>["patch"] = {};
    if (title.trim() !== base.title) patch.title = title.trim();
    if (description !== (base.description ?? "")) patch.description = description || null;
    if ((dueIso || null) !== baseDue) patch.dueAt = dueIso || null;
    if (allDay !== base.isAllDay) patch.isAllDay = allDay;
    if (priority !== base.priority) patch.priority = priority;
    startSaveTransition(async () => {
      const res =
        Object.keys(patch).length === 0
          ? { ok: true as const }
          : await mutate({ kind: "card.update", cardId: card.id, patch }, `Edit “${title.trim()}”`);
      if (!res.ok) pushToast({ message: res.error });
      else if (thenClose) close();
      else pushToast({ message: "Saved" });
    });
  };

  const toggleComplete = () => {
    void mutate(
      { kind: "card.complete", cardId: card.id, completed: !done },
      `${done ? "Reopen" : "Complete"} “${card.title}”`,
    );
  };

  const remove = () => {
    const fd = new FormData();
    fd.set("cardId", card.id);
    startRemoveTransition(async () => {
      const res = await archiveCard(fd);
      if (!res.ok) {
        pushToast({ message: res.error });
        return;
      }
      close();
      pushToast({
        message: "Card deleted",
        actionLabel: "Undo",
        onAction: () => {
          const undoFd = new FormData();
          undoFd.set("cardId", card.id);
          void restoreCard(undoFd);
        },
      });
    });
  };

  const [, startPromoteTransition] = useTransition();

  const promote = () => {
    const fd = new FormData();
    fd.set("cardId", card.id);
    startPromoteTransition(async () => {
      const res = await promoteIdea(fd);
      if (!res.ok) {
        pushToast({ message: res.error });
        return;
      }
      router.push(`/p/${projectId}/b/todo?card=${card.id}`, { scroll: false });
      pushToast({
        message: "Promoted to To-Do → Backlog",
        actionLabel: "Undo",
        onAction: () => {
          void mutate(
            {
              kind: "card.move",
              cardId: card.id,
              toColumnId: res.data.previousColumnId,
              position: res.data.previousPosition,
            },
            `Move “${card.title}” back`,
          );
        },
      });
    });
  };

  const setScore = (impact: number | null, effort: number | null) => {
    const fd = new FormData();
    fd.set("cardId", card.id);
    fd.set("impact", impact === null ? "" : String(impact));
    fd.set("effort", effort === null ? "" : String(effort));
    startSaveTransition(async () => {
      await updateCardScore(fd);
    });
  };

  const duplicate = () => {
    const fd = new FormData();
    fd.set("cardId", card.id);
    startTransition(async () => {
      const res = await duplicateCard(fd);
      if (!res.ok) {
        pushToast({ message: res.error });
        return;
      }
      close();
      router.push(
        `/p/${projectId}/b/${boardKind}?card=${res.data.newCardId}`,
        { scroll: false },
      );
    });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      pushToast({ message: "Link copied" });
    } catch {
      pushToast({ message: "Could not copy link" });
    }
  };

  const moveTo = (kind: string) => {
    const fd = new FormData();
    fd.set("cardId", card.id);
    fd.set("boardKind", kind);
    startTransition(async () => {
      const res = await moveCardToBoard(fd);
      if (!res.ok) {
        pushToast({ message: res.error });
        return;
      }
      router.push(`/p/${projectId}/b/${kind}?card=${card.id}`, {
        scroll: false,
      });
    });
  };

  const setCover = (color: string) => {
    const fd = new FormData();
    fd.set("cardId", card.id);
    fd.set("coverColor", color);
    startTransition(async () => {
      await setCardCover(fd);
    });
  };

  return (
    <Sheet open variant="side" onClose={requestClose} label="Card details">
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          {canEdit ? <button
            onClick={toggleComplete}
            aria-pressed={done}
            aria-label={done ? "Mark as not done" : "Mark as done"}
            className="-mx-2.5 -mb-2.5 -mt-1.5 flex h-11 w-11 shrink-0 items-center justify-center"
          >
            <span
              className={
                "flex h-6 w-6 items-center justify-center rounded-full border transition-colors " +
                (done
                  ? "border-success bg-success text-accent-fg"
                  : "border-border hover:border-accent")
              }
            >
              {done && <CheckIcon className="h-3.5 w-3.5" />}
            </span>
          </button> : <span className="h-6 w-6" />}
          <h2 className="sr-only">Card details</h2>
          <button
            onClick={requestClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Not the shared `Input` (components/ui/input.tsx): its base
            classes (`border border-border`, `focus:border-accent`) would
            sit in the same `@layer utilities` as a `border-transparent`
            override with no tailwind-merge to resolve the tie — a plain,
            self-contained `<input>` with `border-0` (no border-color
            utility at all) is the only way to make "no border, ever" here
            unambiguous. */}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Card title"
          disabled={!canEdit}
          className="h-auto w-full border-0 bg-transparent px-0 text-lg font-semibold text-text disabled:opacity-50"
        />

        <div className="space-y-1">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description… (markdown)"
            rows={4}
            aria-label="Description"
            disabled={!canEdit}
            className="w-full resize-y rounded-md border border-border bg-surface-2 p-3 text-sm"
          />
          {card.descriptionHtml && (
            <details>
              <summary className="cursor-pointer text-xs text-muted">
                Preview
              </summary>
              <div
                className="mt-2 space-y-1 rounded-md border border-border p-3 text-sm [&_a]:underline [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-surface-2 [&_pre]:p-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                dangerouslySetInnerHTML={{ __html: card.descriptionHtml }}
              />
            </details>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Due</p>
          <div className="flex items-center gap-3">
            <input
              type={allDay ? "date" : "datetime-local"}
              value={dueInput}
              onChange={(e) => setDueInput(e.target.value)}
              aria-label="Due date"
              disabled={!canEdit}
              className="h-11 min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-3 text-sm"
            />
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => changeAllDay(e.target.checked)}
                disabled={!canEdit}
              />
              All-day
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Priority</p>
          <div className="flex gap-2" role="group" aria-label="Priority">
            {([...PRIORITY_VALUES, 4] as const).map((p) => {
              const selected = p === 4 ? priority === null : priority === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p === 4 ? null : p)}
                  disabled={!canEdit}
                  aria-pressed={selected}
                  className={cn(
                    "flex h-11 min-w-11 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors disabled:opacity-60",
                    selected
                      ? p === 4
                        ? "border-accent bg-accent/10 text-accent-strong"
                        : PRIORITY_BUTTON_CLASS[p]
                      : "border-border text-muted hover:text-text",
                  )}
                >
                  P{p}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted">
          <span>
            Created {new Date(card.createdAt).toLocaleDateString()}
          </span>
          <span>Updated {new Date(card.updatedAt).toLocaleDateString()}</span>
        </div>

        {canEdit && <section className="space-y-2">
          <p className="text-sm font-medium">Cover</p>
          <div className="flex flex-wrap gap-1">
            {COVER_SWATCHES.map((c) => (
                <button
                  key={c || "none"}
                  onClick={() => setCover(c)}
                  aria-label={c ? `Cover ${c}` : "No cover"}
                  aria-pressed={(card.coverColor ?? "") === c}
                  className="flex h-11 w-11 items-center justify-center rounded-md"
                >
                  <span
                    className={
                      "h-6 w-6 rounded-md border " +
                      (c ? "border-transparent" : "border-dashed border-muted") +
                      ((card.coverColor ?? "") === c ? " ring-2 ring-text ring-offset-2 ring-offset-surface" : "")
                    }
                    style={c ? { backgroundColor: c } : undefined}
                  />
                </button>
              ),
            )}
          </div>
        </section>}

        <section className="space-y-2">
          <p className="text-sm font-medium">Actions</p>
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Button variant="secondary" size="sm" onClick={duplicate}>
                Duplicate
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => void copyLink()}>
              Copy link
            </Button>
            {canEdit && !isIdeasBoard &&
              ["todo", "ideas", "work"]
                .filter((k) => k !== boardKind)
                .map((k) => (
                  <Button key={k} variant="secondary" size="sm" onClick={() => moveTo(k)}>
                    Move to {BOARD_LABEL[k]}
                  </Button>
                ))}
          </div>
        </section>

        <ChecklistSection
          cardId={card.id}
          items={checklist}
          readOnly={!canEdit}
          cardTitle={title}
          cardDescription={description}
        />
        <LabelsSection
          projectId={projectId}
          cardId={card.id}
          labels={labels}
          activeIds={activeLabelIds}
          canManage={canManageLabels}
          canEdit={canEdit}
        />

        {isIdeasBoard && canEdit && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Idea score</p>
              {scoreOf(card.impact ?? null, card.effort ?? null) !== null && (
                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-bold text-accent-strong">
                  {formatScore(scoreOf(card.impact ?? null, card.effort ?? null)!)}
                </span>
              )}
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-muted">
                Impact
                <select
                  value={card.impact ?? ""}
                  onChange={(e) =>
                    setScore(
                      e.target.value ? Number(e.target.value) : null,
                      card.effort,
                    )
                  }
                  aria-label="Impact"
                  className="h-11 rounded-md border border-border bg-surface-2 px-2 text-sm"
                >
                  <option value="">Not set</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-muted">
                Effort
                <select
                  value={card.effort ?? ""}
                  onChange={(e) =>
                    setScore(
                      card.impact,
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                  aria-label="Effort"
                  className="h-11 rounded-md border border-border bg-surface-2 px-2 text-sm"
                >
                  <option value="">Not set</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        )}

        {isIdeasBoard && canEdit && (
          <button
            onClick={promote}
            className="min-h-11 w-full rounded-md border border-accent/40 bg-accent/10 text-sm font-medium text-accent-strong transition-colors hover:bg-accent hover:text-accent-fg"
          >
            Promote to To-Do
          </button>
        )}

        <AssigneesSection
          cardId={card.id}
          members={members}
          activeIds={activeAssigneeIds}
          readOnly={!canEdit}
        />
        <AttachmentsSection
          cardId={card.id}
          attachments={attachments}
          cloudinaryReady={cloudinaryReady}
          readOnly={!canEdit}
        />
        <CommentsSection
          cardId={card.id}
          comments={comments}
          viewerName={viewerName}
          readOnly={!canEdit}
        />

        {history.length > 0 && (
          <section className="space-y-1.5">
            <p className="text-sm font-medium">History</p>
            <ul className="space-y-1">
              {history.map((h, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-muted">{h.text}</span>
                  <span className="shrink-0 text-[10px] text-muted">
                    {new Date(h.when).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="sticky bottom-0 -mx-5 -mb-[calc(1.25rem+env(safe-area-inset-bottom))] flex items-center justify-between border-t border-border bg-surface px-5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-4">
          {canEdit ? <>
          <Button variant="danger" size="sm" onClick={remove}>
            Delete
          </Button>
          <Button onClick={() => save()} disabled={!title.trim() || pendingSave}>
            {pendingSave ? "Saving…" : "Save"}
          </Button>
          </> : <Button className="ml-auto" variant="secondary" onClick={close}>Close</Button>}
        </div>
      </div>

      <Modal
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        label="Unsaved changes"
      >
        <h3 className="mb-2 text-lg font-semibold">Save your changes?</h3>
        <p className="mb-4 text-sm text-muted">
          You edited this card. Closing without saving loses those edits.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Discard
          </Button>
          <Button onClick={() => save(true)} disabled={!title.trim() || pendingSave}>
            {pendingSave ? "Saving…" : "Save & close"}
          </Button>
        </div>
      </Modal>
    </Sheet>
  );
}
