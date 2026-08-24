"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProject } from "@/lib/actions/projects";
import {
  PROJECT_COLORS,
  PROJECT_EMOJIS,
} from "@/lib/validation/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/dialog";

export function NewProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState<string>(PROJECT_EMOJIS[2]);
  const [color, setColor] = useState<string>(PROJECT_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setName("");
      setError(null);
    }
    onOpenChange(next);
  };

  const submit = () => {
    if (!name.trim()) {
      setError("Give it a name");
      return;
    }
    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("emoji", emoji);
    fd.set("color", color);
    startTransition(async () => {
      const res = await createProject(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      handleOpenChange(false);
      router.push(`/p/${res.data.projectId}`);
    });
  };

  return (
    <Modal open={open} onClose={() => handleOpenChange(false)} label="New project">
      <h2 className="mb-4 text-lg font-semibold">New project</h2>
      <div className="space-y-4">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name"
          maxLength={80}
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
            Icon
          </p>
          <div className="grid grid-cols-8 gap-1">
            {PROJECT_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                aria-label={`Emoji ${e}`}
                className={
                  "flex h-9 items-center justify-center rounded-md text-lg transition-colors " +
                  (emoji === e ? "bg-accent/20 ring-1 ring-accent" : "hover:bg-surface-2")
                }
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
            Color
          </p>
          <div className="flex gap-2">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={
                  "h-7 w-7 rounded-full transition-transform " +
                  (color === c ? "scale-110 ring-2 ring-text ring-offset-2 ring-offset-surface" : "")
                }
              />
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Creating…" : "Create project"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
