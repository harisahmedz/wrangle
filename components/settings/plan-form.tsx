"use client";

// Settings → Plan my week (V3 S6): the scheduler's daily and weekend caps,
// saved to `users.prefs.plan` through `setPlanPrefs`. Same save/feedback
// pattern as TimezoneForm. Limits mirror `planPrefSchema` (1–20 / 0–20).
import { useState, useTransition } from "react";
import { setPlanPrefs } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PlanForm({ dailyCap, weekendCap }: { dailyCap: number; weekendCap: number }) {
  const [daily, setDaily] = useState(String(dailyCap));
  const [weekend, setWeekend] = useState(String(weekendCap));
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const fd = new FormData();
    fd.set("dailyCap", daily);
    fd.set("weekendCap", weekend);
    startTransition(async () => {
      const res = await setPlanPrefs(fd);
      if (res.ok) {
        setSaved(true);
        setError(null);
      } else {
        setError(res.error);
      }
    });
  };

  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    setSaved(false);
    setError(null);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        How many cards &ldquo;Plan my week&rdquo; (on Upcoming) puts on each day.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-muted">Weekdays</span>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            value={daily}
            onChange={(e) => edit(setDaily)(e.target.value)}
            className="w-24"
            aria-label="Cards per weekday"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-muted">Weekend days</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={20}
            value={weekend}
            onChange={(e) => edit(setWeekend)(e.target.value)}
            className="w-24"
            aria-label="Cards per weekend day"
          />
        </label>
        <Button variant="secondary" size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      <p aria-live="polite" className="min-h-4 text-xs text-muted">
        {error ?? (saved ? "Saved" : "")}
      </p>
    </div>
  );
}
