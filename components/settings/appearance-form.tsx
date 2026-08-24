"use client";

import { useState, useTransition } from "react";
import { updateProfile } from "@/lib/actions/settings";
import { applyTheme } from "@/components/settings/theme";
import type { ThemeMode } from "@/lib/validation/settings";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemeMode; label: string; description: string }[] = [
  { value: "dark", label: "Dark", description: "The house look." },
  { value: "light", label: "Light", description: "For bright rooms." },
  { value: "system", label: "System", description: "Follows your device automatically." },
];

export function AppearanceForm({ theme }: { theme: ThemeMode }) {
  const [value, setValue] = useState<ThemeMode>(theme);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = (mode: ThemeMode) => {
    setValue(mode);
    setSaved(false);
    setError(null);
    applyTheme(mode);
    const fd = new FormData();
    fd.set("theme", mode);
    startTransition(async () => {
      const res = await updateProfile(fd);
      if (res.ok) {
        setSaved(true);
        setError(null);
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div>
      <div className="grid gap-1.5 sm:grid-cols-3">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors focus-within:border-accent focus-within:ring-1 focus-within:ring-accent",
              value === option.value
                ? "border-accent bg-accent/10"
                : "border-border hover:bg-surface-2",
            )}
          >
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={value === option.value}
              onChange={() => choose(option.value)}
              className="sr-only"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{option.label}</span>
              <span className="block text-xs text-muted">
                {option.description}
              </span>
            </span>
          </label>
        ))}
      </div>
      <p aria-live="polite" className="mt-2 min-h-4 text-xs text-muted">
        {pending ? "Saving…" : (error ?? (saved ? "Saved" : ""))}
      </p>
    </div>
  );
}
