"use client";

import { useEffect, useState, useTransition } from "react";
import { quickAddCard } from "@/lib/kanban/phase3-actions";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

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
      pushToast({ message: `Added “${res.data.title}” to My Space` });
      close();
    });
  };

  return (
    <Sheet open={open} onClose={close} label="Quick add">
      <h2 className="mb-1 text-lg font-semibold">Quick add</h2>
      <p className="mb-4 text-sm text-muted">Saves to My Space, on the To-Do board.</p>
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
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" onClick={handOffToDump}>
          Sort in the Dump
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !title.trim()}>
            {pending ? "Adding…" : "Add task"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
