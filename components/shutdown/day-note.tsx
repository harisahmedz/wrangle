"use client";

import { useEffect, useState } from "react";
import { saveDayNote } from "@/lib/actions/shutdown";
import { useToast } from "@/components/ui/toast";

const MAX_NOTE = 500;

type NoteStatus = "idle" | "pending" | "saved" | "error";

const STATUS_TEXT: Record<NoteStatus, string> = {
  idle: "Draft saves automatically",
  pending: "Saving…",
  saved: "Saved",
  error: "",
};

export function DayNote({ initialNote }: { initialNote: string }) {
  const pushToast = useToast();
  const [note, setNote] = useState(initialNote);
  const [status, setStatus] = useState<NoteStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "pending") return;
    const t = setTimeout(async () => {
      const fd = new FormData();
      fd.set("note", note);
      const res = await saveDayNote(fd);
      if (res.ok) {
        setStatus("saved");
      } else {
        setError(res.error);
        setStatus("error");
        pushToast({ message: res.error });
      }
    }, 800);
    return () => clearTimeout(t);
  }, [note, status, pushToast]);

  return (
    <section className="space-y-2">
      <label
        htmlFor="day-note"
        className="text-sm font-semibold uppercase tracking-wider text-muted"
      >
        One line about today
      </label>
      <textarea
        id="day-note"
        value={note}
        maxLength={MAX_NOTE}
        rows={3}
        placeholder="One line about today…"
        onChange={(e) => {
          setError(null);
          setStatus("pending");
          setNote(e.target.value);
        }}
        className="w-full rounded-md border border-border bg-surface-2 px-3 py-2.5 text-sm"
      />
      <div className="flex items-center justify-between px-1 text-xs">
        <span className={status === "error" ? "text-danger" : "text-muted"}>
          {status === "error" ? error : STATUS_TEXT[status]}
        </span>
        <span className="text-muted">
          {note.length}/{MAX_NOTE}
        </span>
      </div>
    </section>
  );
}
