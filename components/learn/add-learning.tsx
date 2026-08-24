"use client";

import { useState, useTransition } from "react";
import { createLearningItem } from "@/lib/actions/learning";
import { Sheet } from "@/components/ui/dialog";

const TYPES = [
  ["course", "🎓 Course"],
  ["book", "📖 Book"],
  ["video", "🎬 Video"],
  ["article", "📰 Article"],
  ["skill", "🛠️ Skill"],
  ["other", "📦 Other"],
];

export function AddLearningButton() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("course");
  const [sourceUrl, setSourceUrl] = useState("");
  const [whyNote, setWhyNote] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const close = () => {
    setTitle("");
    setSourceUrl("");
    setWhyNote("");
    setTargetDate("");
    setError(null);
    setOpen(false);
  };

  const submit = () => {
    if (!title.trim()) {
      setError("Give it a title");
      return;
    }
    const fd = new FormData();
    fd.set("title", title.trim());
    fd.set("type", type);
    fd.set("sourceUrl", sourceUrl.trim());
    fd.set("whyNote", whyNote.trim());
    fd.set("targetDate", targetDate);
    startTransition(async () => {
      const res = await createLearningItem(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      close();
    });
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-fg"
      >
        + Add
      </button>
      <Sheet open={open} onClose={close} label="Add learning item">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Want to learn something?</h2>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Title…"
            aria-label="Title"
            maxLength={200}
            className="h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm"
          />
          <div className="flex flex-wrap gap-1.5">
            {TYPES.map(([v, label]) => (
              <button
                key={v}
                onClick={() => setType(v)}
                aria-pressed={type === v}
                className={
                  "rounded-full border px-2.5 py-1 text-xs transition-colors " +
                  (type === v
                    ? "border-accent bg-accent/15 text-text"
                    : "border-border text-muted")
                }
              >
                {label}
              </button>
            ))}
          </div>
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://source-url… (optional)"
            inputMode="url"
            aria-label="Source URL"
            className="h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm"
          />
          <textarea
            value={whyNote}
            onChange={(e) => setWhyNote(e.target.value)}
            placeholder="Why do you care about this? (optional)"
            rows={2}
            aria-label="Why note"
            className="w-full resize-none rounded-md border border-border bg-surface-2 p-2 text-sm"
          />
          <div className="flex items-center gap-2 text-sm text-muted">
            Target date
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              aria-label="Target date"
              className="h-9 flex-1 rounded-md border border-border bg-surface-2 px-2"
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={close} className="px-3 py-2 text-sm text-muted hover:text-text">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!title.trim()}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
            >
              Add to Want
            </button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
