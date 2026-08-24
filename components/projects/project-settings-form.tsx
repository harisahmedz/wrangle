"use client";

import { useActionState, useState } from "react";
import { updateProject } from "@/lib/actions/projects";
import {
  PROJECT_COLORS,
  PROJECT_EMOJIS,
} from "@/lib/validation/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function ProjectSettingsForm({
  projectId,
  name: initialName,
  emoji: initialEmoji,
  color: initialColor,
}: {
  projectId: string;
  name: string;
  emoji: string;
  color: string;
}) {
  const [name, setName] = useState(initialName);
  const [emoji, setEmoji] = useState(initialEmoji);
  const [color, setColor] = useState(initialColor);
  const [state, formAction, pending] = useActionState(
    async (_prev: { ok: boolean; error?: string } | null, fd: FormData) => {
      const res = await updateProject(fd);
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    },
    null,
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="emoji" value={emoji} />
      <input type="hidden" name="color" value={color} />

      <div>
        <label
          htmlFor="project-name"
          className="mb-1.5 block text-sm font-medium"
        >
          Name
        </label>
        <Input
          id="project-name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          required
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Icon</p>
        <div className="grid grid-cols-8 gap-1 sm:w-96">
          {PROJECT_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              aria-label={`Emoji ${e}`}
              aria-pressed={emoji === e}
              className={cn(
                "flex h-9 items-center justify-center rounded-md text-lg transition-colors",
                emoji === e
                  ? "bg-accent/20 ring-1 ring-accent"
                  : "hover:bg-surface-2",
              )}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Color</p>
        <div className="flex gap-2">
          {PROJECT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              style={{ backgroundColor: c }}
              className={cn(
                "h-7 w-7 rounded-full transition-transform",
                color === c &&
                  "scale-110 ring-2 ring-text ring-offset-2 ring-offset-surface",
              )}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        {state?.ok && !pending && (
          <span className="text-sm text-muted">Saved</span>
        )}
        {state && !state.ok && (
          <span className="text-sm text-danger">{state.error}</span>
        )}
      </div>
    </form>
  );
}
