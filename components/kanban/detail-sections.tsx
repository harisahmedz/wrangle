"use client";

import { useRouter } from "next/navigation";
import {
  useMemo,
  useRef,
  useState,
  useOptimistic,
  useTransition,
} from "react";
import {
  addChecklistItem,
  addComment,
  confirmAttachment,
  createLabel,
  deleteAttachment,
  deleteChecklistItem,
  deleteComment,
  restoreAttachment,
  restoreChecklistItem,
  restoreComment,
  setCardAssignees,
  setCardLabels,
  signUpload,
} from "@/lib/kanban/detail-actions";
import { mutate } from "@/lib/mutations";
import { useOutbox } from "@/lib/outbox/client";
import { overlayChecklist } from "@/lib/outbox/overlay";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { CheckIcon, CloseIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { LABEL_COLORS } from "@/lib/palette";
import { useAiAvailable } from "@/lib/ai";

export type ChecklistRow = { id: string; text: string; isDone: boolean };
export type LabelRow = { id: string; name: string; color: string };
export type MemberRow = { userId: string; name: string | null; image: string | null };
export type CommentRow = {
  id: string;
  authorName: string;
  bodyHtml: string;
  createdAt: string;
  isMine: boolean;
  canDelete: boolean;
};
export type AttachmentRow = {
  id: string;
  url: string;
  mime: string;
  bytes: number;
  canDelete: boolean;
};

const TOAST_LABELS_FAILED = "Couldn't save labels — retry?";
const TOAST_ASSIGNEES_FAILED = "Couldn't save assignees — retry?";
const TOAST_COMMENT_FAILED = "Couldn't post the comment — retry?";

function usePendingGuard() {
  const pending = useRef(new Set<string>());
  const begin = (key: string) => {
    if (pending.current.has(key)) return false;
    pending.current.add(key);
    return true;
  };
  const end = (key: string) => {
    pending.current.delete(key);
  };
  return { begin, end };
}

function escapeCommentHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br />");
}

export function ChecklistSection({
  cardId,
  items,
  readOnly = false,
  cardTitle = "",
  cardDescription = "",
}: {
  cardId: string;
  items: ChecklistRow[];
  readOnly?: boolean;
  cardTitle?: string;
  cardDescription?: string;
}) {
  const pushToast = useToast();
  const [text, setText] = useState("");
  // AI "Split into checklist" (V3 S2): suggestions are only a preview until
  // the user adds them through the normal addChecklistItem path.
  const { available: aiAvailable } = useAiAvailable();
  const [split, setSplit] = useState<"idle" | "loading" | "failed">("idle");
  const [suggested, setSuggested] = useState<{ text: string; on: boolean }[]>([]);
  const [adding, setAdding] = useState(false);
  // Ticks go through the outbox (`checklist.set`, a SET not a flip — docs/
  // OFFLINE-OUTBOX.md §1); the overlay replaces the old useOptimistic flip.
  const { entries: outboxEntries } = useOutbox();
  const optimisticItems = useMemo(() => overlayChecklist(items, outboxEntries), [items, outboxEntries]);
  const [, startTransition] = useTransition();

  const doneCount = optimisticItems.filter((i) => i.isDone).length;
  const pct =
    optimisticItems.length === 0
      ? 0
      : Math.round((doneCount / optimisticItems.length) * 100);

  const add = () => {
    if (!text.trim()) return;
    const fd = new FormData();
    fd.set("cardId", cardId);
    fd.set("text", text.trim());
    startTransition(async () => {
      await addChecklistItem(fd);
    });
    setText("");
  };

  const splitCard = async () => {
    setSplit("loading");
    setSuggested([]);
    try {
      const [{ runTask }, { checklistTask, cleanChecklistItems }] = await Promise.all([
        import("@/lib/ai"),
        import("@/lib/ai/tasks/checklist"),
      ]);
      const r = await runTask(checklistTask, { title: cardTitle, description: cardDescription });
      const clean = r.ok
        ? cleanChecklistItems(r.data.items, optimisticItems.map((i) => i.text), cardTitle)
        : [];
      if (clean.length === 0) {
        setSplit("failed");
        return;
      }
      setSuggested(clean.map((t) => ({ text: t, on: true })));
      setSplit("idle");
    } catch {
      setSplit("failed");
    }
  };

  const chosen = suggested.filter((s) => s.on);
  const addSuggested = async () => {
    setAdding(true);
    // One at a time: the server appends each item after the last position.
    for (const s of chosen) {
      const fd = new FormData();
      fd.set("cardId", cardId);
      fd.set("text", s.text);
      const res = await addChecklistItem(fd);
      if (!res.ok) {
        pushToast({ message: res.error });
        break;
      }
    }
    setAdding(false);
    setSuggested([]);
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Checklist</p>
        <div className="flex items-center gap-2">
          {!readOnly && aiAvailable && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void splitCard()}
              disabled={split === "loading" || adding || !cardTitle.trim()}
            >
              {split === "loading" ? "Splitting…" : "Split into checklist"}
            </Button>
          )}
          <span className="text-xs text-muted">
            {doneCount}/{optimisticItems.length}
          </span>
        </div>
      </div>
      {split === "failed" && <p className="text-xs text-muted">Couldn&apos;t split this one.</p>}
      {suggested.length > 0 && (
        <div className="space-y-1 rounded-md border border-border bg-surface-2 p-2">
          <ul>
            {suggested.map((s, i) => (
              <li key={s.text}>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={s.on}
                    onChange={() =>
                      setSuggested((cur) => cur.map((c, j) => (j === i ? { ...c, on: !c.on } : c)))
                    }
                    className="h-4 w-4 accent-accent"
                  />
                  {s.text}
                </label>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSuggested([])} disabled={adding}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void addSuggested()} disabled={chosen.length === 0 || adding}>
              Add {chosen.length} {chosen.length === 1 ? "item" : "items"}
            </Button>
          </div>
        </div>
      )}
      {optimisticItems.length > 0 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              pct === 100 ? "bg-success" : "bg-accent",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {optimisticItems.length === 0 && (
        <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted">
          No steps yet.
        </p>
      )}
      <ul className="space-y-1">
        {optimisticItems.map((item) => (
          <li key={item.id} className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-surface-2">
            <button
              onClick={() => {
                if (readOnly) return;
                void mutate(
                  { kind: "checklist.set", itemId: item.id, cardId, isDone: !item.isDone },
                  `${item.isDone ? "Untick" : "Tick"} “${item.text}”`,
                ).then((res) => {
                  if (!res.ok) pushToast({ message: res.error });
                });
              }}
              aria-pressed={item.isDone}
              disabled={readOnly}
              aria-label={`Toggle ${item.text}`}
              className="flex h-11 w-11 shrink-0 items-center justify-center"
            >
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded border",
                  item.isDone
                    ? "border-success bg-success text-accent-fg"
                    : "border-border hover:border-accent",
                )}
              >
                {item.isDone && <CheckIcon className="h-3 w-3" />}
              </span>
            </button>
            <span className={cn("flex-1 text-sm", item.isDone && "text-muted line-through")}>
              {item.text}
            </span>
            {!readOnly && <button
              onClick={() => {
                const fd = new FormData();
                fd.set("itemId", item.id);
                startTransition(async () => {
                  const res = await deleteChecklistItem(fd);
                  if (!res.ok) {
                    pushToast({ message: res.error });
                    return;
                  }
                  pushToast({
                    message: "Checklist item deleted",
                    actionLabel: "Undo",
                    onAction: () => {
                      const undo = new FormData();
                      undo.set("itemId", item.id);
                      void restoreChecklistItem(undo);
                    },
                  });
                });
              }}
              aria-label={`Delete ${item.text}`}
              className="flex h-11 w-11 items-center justify-center text-muted sm:h-auto sm:w-auto sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100 hover:text-danger"
            >
              <CloseIcon className="h-4 w-4" />
            </button>}
          </li>
        ))}
      </ul>
      {!readOnly && <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        placeholder="+ Add item"
        aria-label="New checklist item"
        className="h-11 w-full rounded-md border border-border bg-surface-2 px-2 text-sm"
      />}
    </section>
  );
}

export function LabelsSection({
  projectId,
  cardId,
  labels,
  activeIds,
  canManage,
  canEdit = true,
}: {
  projectId: string;
  cardId: string;
  labels: LabelRow[];
  activeIds: string[];
  canManage: boolean;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const pushToast = useToast();
  const guard = usePendingGuard();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(LABEL_COLORS[3]);
  const [optimisticIds, applyOptimisticIds] = useOptimistic(
    activeIds,
    (_current: string[], next: string[]) => next,
  );
  const [, startTransition] = useTransition();

  const toggle = (labelId: string) => {
    if (!guard.begin(`label:${labelId}`)) return;
    const next = optimisticIds.includes(labelId)
      ? optimisticIds.filter((id) => id !== labelId)
      : [...optimisticIds, labelId];
    startTransition(async () => {
      applyOptimisticIds(next);
      const fd = new FormData();
      fd.set("cardId", cardId);
      fd.set("labelIds", JSON.stringify(next));
      try {
        const res = await setCardLabels(fd);
        if (!res.ok) {
          pushToast({ message: TOAST_LABELS_FAILED });
          router.refresh();
        }
      } finally {
        guard.end(`label:${labelId}`);
      }
    });
  };

  const add = () => {
    if (!name.trim()) return;
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("name", name.trim());
    fd.set("color", color);
    startTransition(async () => {
      const res = await createLabel(fd);
      if (!res.ok) pushToast({ message: res.error });
    });
    setName("");
    setCreating(false);
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Labels</p>
        {canManage && canEdit && (
          <button
            onClick={() => setCreating((c) => !c)}
            className="text-xs text-muted hover:text-text"
          >
            {creating ? "Cancel" : "+ New"}
          </button>
        )}
      </div>
      {creating && (
        <div className="space-y-2 rounded-md border border-border bg-surface-2 p-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Label name"
            aria-label="Label name"
            className="h-11 w-full rounded-md border border-border bg-surface px-2 text-sm"
          />
          <div className="flex flex-wrap gap-1">
            {LABEL_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
                className="flex h-11 w-11 items-center justify-center rounded-md"
              >
                <span
                  style={{ backgroundColor: c }}
                  className={cn(
                    "h-6 w-6 rounded-full",
                    color === c && "ring-2 ring-text ring-offset-2 ring-offset-surface-2",
                  )}
                />
              </button>
            ))}
          </div>
          <Button size="sm" onClick={add}>
            Create label
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {labels.map((label) => {
          const active = optimisticIds.includes(label.id);
          return (
            <button
              key={label.id}
              onClick={() => toggle(label.id)}
              disabled={!canEdit}
              aria-pressed={active}
              style={
                active
                  ? { backgroundColor: `${label.color}33`, borderColor: label.color, color: label.color }
                  : undefined
              }
              className={cn(
                "flex min-h-11 items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs transition-colors",
                !active && "text-muted hover:text-text",
              )}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: label.color }}
              />
              {label.name}
            </button>
          );
        })}
        {labels.length === 0 && (
          <p className="text-xs text-muted">
            No labels in this project yet.
          </p>
        )}
      </div>
    </section>
  );
}

export function AssigneesSection({
  cardId,
  members,
  activeIds,
  readOnly = false,
}: {
  cardId: string;
  members: MemberRow[];
  activeIds: string[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const pushToast = useToast();
  const guard = usePendingGuard();
  const [optimisticIds, applyOptimisticIds] = useOptimistic(
    activeIds,
    (_current: string[], next: string[]) => next,
  );
  const [, startTransition] = useTransition();

  const toggle = (userId: string) => {
    if (!guard.begin(`assignee:${userId}`)) return;
    const next = optimisticIds.includes(userId)
      ? optimisticIds.filter((id) => id !== userId)
      : [...optimisticIds, userId];
    startTransition(async () => {
      applyOptimisticIds(next);
      const fd = new FormData();
      fd.set("cardId", cardId);
      fd.set("userIds", JSON.stringify(next));
      try {
        const res = await setCardAssignees(fd);
        if (!res.ok) {
          pushToast({ message: TOAST_ASSIGNEES_FAILED });
          router.refresh();
        }
      } finally {
        guard.end(`assignee:${userId}`);
      }
    });
  };

  return (
    <section className="space-y-2">
      <p className="text-sm font-medium">Assignees</p>
      <div className="flex flex-wrap gap-1.5">
        {members.map((m) => {
          const active = optimisticIds.includes(m.userId);
          const initial = m.name?.trim()?.charAt(0)?.toUpperCase() ?? "?";
          return (
            <button
              key={m.userId}
              onClick={() => toggle(m.userId)}
              disabled={readOnly}
              aria-pressed={active}
              title={m.name ?? undefined}
              className={cn(
                "flex min-h-11 items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs transition-colors",
                active
                  ? "border-accent bg-accent/10 text-text"
                  : "border-border text-muted hover:text-text",
              )}
            >
              <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-surface-2 text-[10px] font-semibold">
                {m.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  initial
                )}
              </span>
              {m.name?.split(" ")[0] ?? "Member"}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function CommentsSection({
  cardId,
  comments,
  viewerName,
  readOnly = false,
}: {
  cardId: string;
  comments: CommentRow[];
  viewerName?: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const pushToast = useToast();
  const guard = usePendingGuard();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [optimisticComments, appendOptimisticComment] = useOptimistic(
    comments,
    (current: CommentRow[], comment: CommentRow) => [...current, comment],
  );
  const [, startTransition] = useTransition();

  const post = () => {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    if (!guard.begin("comment")) return;
    setSending(true);
    const temp: CommentRow = {
      id: `temp-${crypto.randomUUID()}`,
      authorName: viewerName ?? "You",
      bodyHtml: escapeCommentHtml(trimmed),
      createdAt: new Date().toISOString(),
      isMine: true,
      canDelete: false,
    };
    startTransition(async () => {
      appendOptimisticComment(temp);
      const fd = new FormData();
      fd.set("cardId", cardId);
      fd.set("body", trimmed);
      try {
        const res = await addComment(fd);
        if (!res.ok) {
          pushToast({ message: TOAST_COMMENT_FAILED });
          router.refresh();
        }
      } finally {
        guard.end("comment");
        setSending(false);
      }
    });
    setBody("");
  };

  return (
    <section className="space-y-3">
      <p className="text-sm font-medium">Comments</p>
      {!readOnly && <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post();
        }}
        placeholder="Write a comment… (markdown)"
        rows={3}
        maxLength={5000}
        aria-label="New comment"
        className="w-full resize-y rounded-md border border-border bg-surface-2 p-2 text-sm"
      />}
      {!readOnly && (
        <Button size="sm" onClick={post} disabled={sending || !body.trim()}>
          Comment
        </Button>
      )}
      {optimisticComments.length === 0 && (
        <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted">
          No comments yet.
        </p>
      )}
      <ul className="space-y-3">
        {optimisticComments.map((c) => (
          <li key={c.id} className="group rounded-lg border border-border bg-surface-2/50 p-3">
            <div className="mb-1 flex items-center justify-between text-xs text-muted">
              <span className="font-medium text-text">{c.authorName}</span>
              <span className="flex items-center gap-2">
                {new Date(c.createdAt).toLocaleString()}
                {!readOnly && c.canDelete && (
                  <button
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("commentId", c.id);
                      startTransition(async () => {
                        const res = await deleteComment(fd);
                        if (!res.ok) {
                          pushToast({ message: res.error });
                          return;
                        }
                        pushToast({
                          message: "Comment deleted",
                          actionLabel: "Undo",
                          onAction: () => {
                            const undo = new FormData();
                            undo.set("commentId", c.id);
                            void restoreComment(undo);
                          },
                        });
                      });
                    }}
                    aria-label="Delete comment"
                    className="flex h-11 w-11 items-center justify-center transition-opacity sm:h-auto sm:w-auto sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100 hover:text-danger"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                )}
              </span>
            </div>
            <div
              className="prose-sm space-y-1 break-words text-sm [&_a]:underline [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-surface-2 [&_pre]:p-2"
              dangerouslySetInnerHTML={{ __html: c.bodyHtml }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AttachmentsSection({
  cardId,
  attachments,
  cloudinaryReady,
  readOnly = false,
}: {
  cardId: string;
  attachments: AttachmentRow[];
  cloudinaryReady: boolean;
  readOnly?: boolean;
}) {
  const pushToast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [, startTransition] = useTransition();

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const signFd = new FormData();
      signFd.set("cardId", cardId);
      signFd.set("mime", file.type || "application/octet-stream");
      signFd.set("bytes", String(file.size));
      const signRes = await signUpload(signFd);
      if (!signRes.ok) {
        pushToast({ message: signRes.error });
        return;
      }

      const form = new FormData();
      form.set("file", file);
      form.set("api_key", signRes.data.apiKey);
      form.set("timestamp", String(signRes.data.timestamp));
      form.set("signature", signRes.data.signature);
      form.set("public_id", signRes.data.publicId);
      form.set("folder", signRes.data.folder);
      form.set("allowed_formats", signRes.data.allowedFormats);

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${signRes.data.cloudName}/auto/upload`,
        { method: "POST", body: form },
      );
      if (!res.ok) {
        pushToast({ message: "Upload failed" });
        return;
      }
      const json = (await res.json()) as {
        public_id: string;
        secure_url: string;
        width?: number;
        height?: number;
      };

      const confirmFd = new FormData();
      confirmFd.set("cardId", cardId);
      confirmFd.set("publicId", json.public_id);
      confirmFd.set("url", json.secure_url);
      confirmFd.set("mime", file.type || "application/octet-stream");
      confirmFd.set("bytes", String(file.size));
      if (json.width) confirmFd.set("width", String(json.width));
      if (json.height) confirmFd.set("height", String(json.height));
      const confirmRes = await confirmAttachment(confirmFd);
      if (!confirmRes.ok) pushToast({ message: confirmRes.error });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Attachments</p>
        {cloudinaryReady && !readOnly && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
              className="hidden"
              id={`file-${cardId}`}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="text-xs text-muted hover:text-text disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "+ Upload (≤10MB)"}
            </button>
          </>
        )}
      </div>
      {!cloudinaryReady && !readOnly && (
        <p className="rounded-md border border-dashed border-border p-2 text-xs text-muted">
          File uploads aren&apos;t set up for this workspace yet.
        </p>
      )}
      {attachments.length === 0 && cloudinaryReady && (
        <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted">
          No files yet.
        </p>
      )}
      <ul className="space-y-1">
        {attachments.map((a) => (
          <li key={a.id} className="group flex items-center gap-2 rounded-md border border-border bg-surface-2/50 px-2 py-1.5 text-sm">
            <span aria-hidden>{a.mime === "application/pdf" ? "📄" : "🖼️"}</span>
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 truncate underline-offset-2 hover:underline"
            >
              {decodeURIComponent(a.url.split("/").pop() ?? "attachment")}
            </a>
            <span className="text-xs text-muted">
              {(a.bytes / 1024 / 1024).toFixed(1)}MB
            </span>
            {!readOnly && a.canDelete && (
              <button
                onClick={() => {
                  const fd = new FormData();
                  fd.set("attachmentId", a.id);
                  startTransition(async () => {
                    const res = await deleteAttachment(fd);
                    if (!res.ok) {
                      pushToast({ message: res.error });
                      return;
                    }
                    pushToast({
                      message: "Attachment deleted",
                      actionLabel: "Undo",
                      onAction: () => {
                        const undo = new FormData();
                        undo.set("attachmentId", a.id);
                        void restoreAttachment(undo);
                      },
                    });
                  });
                }}
                aria-label="Delete attachment"
                className="flex h-11 w-11 items-center justify-center text-muted sm:h-auto sm:w-auto sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100 hover:text-danger"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
