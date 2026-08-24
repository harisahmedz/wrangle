"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { updateProfile } from "@/lib/actions/settings";
import { TIMEZONES } from "@/lib/validation/settings";
import { Button } from "@/components/ui/button";

function detectedTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

const subscribeToNothing = () => () => {};
const getDetectedTimeZone = detectedTimeZone;
const getServerTimeZone = () => "";

export function TimezoneForm({ timezone }: { timezone: string }) {
  const [value, setValue] = useState(timezone);
  const detected = useSyncExternalStore(
    subscribeToNothing,
    getDetectedTimeZone,
    getServerTimeZone,
  );
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const known = (TIMEZONES as readonly string[]).includes(value);
  const options: readonly string[] = known ? TIMEZONES : [value, ...TIMEZONES];

  const save = () => {
    const fd = new FormData();
    fd.set("timezone", value);
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
    <div className="space-y-2">
      <select
        aria-label="Time zone"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
          setError(null);
        }}
        className="h-11 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-text transition-colors focus:border-accent focus:outline-none disabled:opacity-50 sm:w-96"
      >
        {options.map((tz) => (
          <option key={tz} value={tz}>
            {tz}
          </option>
        ))}
      </select>
      {detected && (
        <p className="text-xs text-muted">
          Detected: {detected}
          {detected !== value && (
            <button
              type="button"
              onClick={() => {
                setValue(detected);
                setSaved(false);
                setError(null);
              }}
              className="ml-2 text-accent underline-offset-2 hover:underline"
            >
              Use detected
            </button>
          )}
        </p>
      )}
      <p className="text-xs text-muted">Powers your Today view and day closes.</p>
      <div className="flex items-center gap-3 pt-1">
        <Button type="button" size="lg" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save time zone"}
        </Button>
        {!pending && saved && <span className="text-sm text-muted">Saved</span>}
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
    </div>
  );
}
