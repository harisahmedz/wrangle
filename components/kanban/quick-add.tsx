"use client";

import { useEffect, useState, useTransition } from "react";
import { quickAddCard } from "@/lib/kanban/phase3-actions";
import { Sheet } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
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
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const pushToast = useToast();

  useEffect(() => {
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail) setTitle(detail);
      setOpen(true);
    };
    window.addEventListener("wrangle-quickadd", onEvent);
    return () => window.removeEventListener("wrangle-quickadd", onEvent);
  }, []);

  const close = () => {
    setTitle("");
    setError(null);
    setOpen(false);
    onClose?.();
  };

  const handOffToDump = () => {
    window.dispatchEvent(
      new CustomEvent("wrangle-dump", { detail: title.trim() }),
    );
    close();
  };

  const submit = () => {
    if (!title.trim()) return;
    const fd = new FormData();
    fd.set("title", title.trim());
    startTransition(async () => {
      const res = await quickAddCard(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      pushToast({ message: `“${res.data.title}” → My Space · To-Do` });
      close();
    });
  };

  return (
    <Sheet open={open} onClose={close} label="Quick add">
      <h2 className="mb-1 text-lg font-semibold">Quick add</h2>
      <p className="mb-4 text-xs text-muted">Saves to My Space → To-Do → Backlog.</p>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="What needs doing?"
        aria-label="Task title"
        className="h-11 w-full rounded-md border border-border bg-surface-2 px-3 text-sm"
        maxLength={300}
      />
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={handOffToDump}
          className="min-h-[44px] px-1 text-sm font-medium text-accent-strong hover:underline"
        >
          Sort this…
        </button>
        <button
          type="button"
          onClick={handOffToDump}
          aria-label="Sort with voice in the Dump"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-muted transition-colors hover:text-text"
        >
          <MicIcon className="h-5 w-5" />
        </button>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button onClick={close} className="px-3 py-2 text-sm text-muted hover:text-text">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={pending || !title.trim()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add task"}
        </button>
      </div>
    </Sheet>
  );
}
