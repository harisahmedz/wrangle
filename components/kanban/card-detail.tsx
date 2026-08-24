"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  archiveCard,
  duplicateCard,
  moveCard,
  moveCardToBoard,
  restoreCard,
  setCardCover,
  toggleCardComplete,
  updateCard,
} from "@/lib/kanban/actions";
import { promoteIdea, updateCardScore } from "@/lib/kanban/phase3-actions";
import { scoreOf, formatScore } from "@/lib/kanban/score";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
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
  isIdeasBoard?: boolean;
  history?: Array<{ text: string; when: string }>;
};

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
  isIdeasBoard = false,
  history = [],
}: Props) {
  const router = useRouter();
  const pushToast = useToast();
  const close = () =>
    router.push(`/p/${projectId}/b/${boardKind}`, { scroll: false });

  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? "");
  const [allDay, setAllDay] = useState(card.isAllDay);
  const [dueInput, setDueInput] = useState(() =>
    toLocalInput(card.dueAt, card.isAllDay),
  );
  const [pendingSave, startSaveTransition] = useTransition();
  const [pendingToggle, startToggleTransition] = useTransition();
  const [, startRemoveTransition] = useTransition();
  const [, startTransition] = useTransition();

  const done = card.completedAt !== null;

  const changeAllDay = (next: boolean) => {
    setAllDay(next);
    setDueInput((v) =>
      next ? v.split("T")[0] : v && v.length === 10 ? `${v}T12:00` : v,
    );
  };

  const save = () => {
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
    const fd = new FormData();
    fd.set("cardId", card.id);
    fd.set("title", title.trim());
    fd.set("description", description);
    fd.set("isAllDay", String(allDay));
    fd.set("dueAt", dueIso);
    startSaveTransition(async () => {
      const res = await updateCard(fd);
      if (!res.ok) pushToast({ message: res.error });
      else pushToast({ message: "Saved" });
    });
  };

  const toggleComplete = () => {
    const fd = new FormData();
    fd.set("cardId", card.id);
    startToggleTransition(async () => {
      await toggleCardComplete(fd);
    });
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
          const undoFd = new FormData();
          undoFd.set("cardId", card.id);
          undoFd.set("toColumnId", res.data.previousColumnId);
          undoFd.set("position", res.data.previousPosition);
          void moveCard(undoFd);
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
    <Sheet open variant="side" onClose={close} label="Card details">
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <button
            onClick={toggleComplete}
            disabled={pendingToggle}
            aria-pressed={done}
            aria-label={done ? "Mark as not done" : "Mark as done"}
            className={
              "mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors " +
              (done
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-border hover:border-accent")
            }
          >
            {done && <span className="text-xs">✓</span>}
          </button>
          <h2 className="sr-only">Card details</h2>
          <button
            onClick={close}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-muted hover:bg-surface-2 hover:text-text"
          >
            ✕
          </button>
        </div>

        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Card title"
          className="h-auto border-transparent bg-transparent px-0 text-lg font-semibold focus:border-transparent"
        />

        <div className="space-y-1">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description… (markdown)"
            rows={4}
            aria-label="Description"
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
              className="h-10 flex-1 rounded-md border border-border bg-surface-2 px-3 text-sm"
            />
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => changeAllDay(e.target.checked)}
              />
              All-day
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted">
          <span>
            Created {new Date(card.createdAt).toLocaleDateString()}
          </span>
          <span>Updated {new Date(card.updatedAt).toLocaleDateString()}</span>
        </div>

        <section className="space-y-2">
          <p className="text-sm font-medium">Cover</p>
          <div className="flex gap-1.5">
            {["", "#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"].map(
              (c) => (
                <button
                  key={c || "none"}
                  onClick={() => setCover(c)}
                  aria-label={c ? `Cover ${c}` : "No cover"}
                  className={
                    "h-6 w-6 rounded-md border " +
                    (c ? "border-transparent" : "border-dashed border-muted") +
                    ((card.coverColor ?? "") === c ? " ring-2 ring-text ring-offset-2 ring-offset-surface" : "")
                  }
                  style={c ? { backgroundColor: c } : undefined}
                />
              ),
            )}
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-sm font-medium">Actions</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={duplicate}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted hover:text-text"
            >
              ⧉ Duplicate
            </button>
            <button
              onClick={() => void copyLink()}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted hover:text-text"
            >
              🔗 Copy link
            </button>
            {!isIdeasBoard &&
              ["todo", "ideas", "work"]
                .filter((k) => k !== boardKind)
                .map((k) => (
                  <button
                    key={k}
                    onClick={() => moveTo(k)}
                    className="rounded-md border border-border px-3 py-1.5 text-xs capitalize text-muted hover:text-text"
                  >
                    → {k}
                  </button>
                ))}
          </div>
        </section>

        <ChecklistSection cardId={card.id} items={checklist} />
        <LabelsSection
          projectId={projectId}
          cardId={card.id}
          labels={labels}
          activeIds={activeLabelIds}
          canManage={canManageLabels}
        />

        {isIdeasBoard && (
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
                  className="h-8 rounded-md border border-border bg-surface-2 px-1.5 text-sm"
                >
                  <option value="">–</option>
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
                  className="h-8 rounded-md border border-border bg-surface-2 px-1.5 text-sm"
                >
                  <option value="">–</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        )}

        {isIdeasBoard && (
          <button
            onClick={promote}
            className="w-full rounded-md border border-accent/40 bg-accent/10 py-2.5 text-sm font-medium text-accent-strong transition-colors hover:bg-accent hover:text-white"
          >
            Promote to To-Do board →
          </button>
        )}

        <AssigneesSection
          cardId={card.id}
          members={members}
          activeIds={activeAssigneeIds}
        />
        <AttachmentsSection
          cardId={card.id}
          attachments={attachments}
          cloudinaryReady={cloudinaryReady}
        />
        <CommentsSection cardId={card.id} comments={comments} />

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

        <div className="flex items-center justify-between border-t border-border pt-4">
          <Button variant="danger" size="sm" onClick={remove}>
            Delete
          </Button>
          <Button onClick={save} disabled={!title.trim() || pendingSave}>
            {pendingSave ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
