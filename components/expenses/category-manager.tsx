"use client";

import { useState, useTransition } from "react";
import {
  archiveCategory,
  createCategory,
  updateCategory,
} from "@/lib/actions/expenses";import { Sheet } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { CategoryChip } from "@/components/expenses/types";

const COLORS = ["#f59e0b", "#3b82f6", "#64748b", "#ec4899", "#10b981", "#8b5cf6", "#14b8a6", "#ef4444"];
const EMOJIS = ["🍔", "🚌", "🧾", "🛍️", "💊", "🎉", "📦", "🏠", "✈️", "🎬", "☕", "🎁"];

export function CategoryManagerButton({
  categories,
}: {
  categories: CategoryChip[];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [color, setColor] = useState(COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const create = () => {
    if (!name.trim()) return;
    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("emoji", emoji);
    fd.set("color", color);
    startTransition(async () => {
      const res = await createCategory(fd);
      if (!res.ok) setError(res.error);
      else {
        setName("");
        setError(null);
      }
    });
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Manage categories"
        className="rounded-md border border-border px-3 py-2 text-sm text-muted transition-colors hover:text-text"
      >
        Categories
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} label="Manage categories">
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Categories</h2>

          <ul className="space-y-1">
            {categories.map((c) => (
              <CategoryRow key={c.id} category={c} />
            ))}
          </ul>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">New category</p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="Name…"
              maxLength={40}
              aria-label="Category name"
              className="h-9 w-full rounded-md border border-border bg-surface-2 px-2 text-sm"
            />
            <div className="flex flex-wrap gap-1">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  aria-label={`Emoji ${e}`}
                  aria-pressed={emoji === e}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md text-base",
                    emoji === e ? "bg-accent/20 ring-1 ring-accent" : "hover:bg-surface-2",
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                  aria-pressed={color === c}
                  style={{ backgroundColor: c }}
                  className={cn(
                    "h-6 w-6 rounded-full",
                    color === c && "ring-2 ring-text ring-offset-2 ring-offset-surface",
                  )}
                />
              ))}
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button
              onClick={create}
              disabled={!name.trim()}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </div>
      </Sheet>
    </>
  );
}

function CategoryRow({ category: c }: { category: CategoryChip }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);
  const [emoji, setEmoji] = useState(c.emoji ?? EMOJIS[0]);
  const [color, setColor] = useState(c.color ?? COLORS[0]);
  const [, startTransition] = useTransition();
  const pushToast = useToast();

  const save = () => {
    const fd = new FormData();
    fd.set("categoryId", c.id);
    fd.set("name", name.trim() || c.name);
    fd.set("emoji", emoji);
    fd.set("color", color);
    startTransition(async () => {
      const res = await updateCategory(fd);
      if (!res.ok) pushToast({ message: res.error });
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <li className="space-y-2 rounded-md border border-accent/40 p-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8 w-full rounded-md border border-border bg-surface-2 px-2 text-sm"
          aria-label="Category name"
        />
        <div className="flex flex-wrap gap-1">
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => setEmoji(e)}
              aria-label={`Emoji ${e}`}
              aria-pressed={emoji === e}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded text-sm",
                emoji === e ? "bg-accent/20 ring-1 ring-accent" : "",
              )}
            >
              {e}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {COLORS.map((col) => (
            <button
              key={col}
              onClick={() => setColor(col)}
              aria-label={`Color ${col}`}
              aria-pressed={color === col}
              style={{ backgroundColor: col }}
              className={cn(
                "h-5 w-5 rounded-full",
                color === col && "ring-2 ring-text ring-offset-1 ring-offset-surface",
              )}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={save} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg">
            Save
          </button>
          <button onClick={() => setEditing(false)} className="px-2 text-xs text-muted">
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="group flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-surface-2">
      <span aria-hidden>{c.emoji}</span>
      <span className="flex-1 text-sm">{c.name}</span>
      <button
        onClick={() => setEditing(true)}
        aria-label={`Edit ${c.name}`}
        className="text-xs text-muted opacity-0 group-hover:opacity-100 hover:text-text"
      >
        Edit
      </button>
      <button
        onClick={() => {
          const fd = new FormData();
          fd.set("categoryId", c.id);
          startTransition(async () => {
            const res = await archiveCategory(fd);
            if (!res.ok) pushToast({ message: res.error });
          });
        }}
        aria-label={`Archive ${c.name}`}
        className="text-xs text-muted opacity-0 group-hover:opacity-100 hover:text-danger"
      >
        Archive
      </button>
    </li>
  );
}
