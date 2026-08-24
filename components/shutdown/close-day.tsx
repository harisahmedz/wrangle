"use client";

import { useTransition } from "react";
import { closeDay, reopenDay } from "@/lib/actions/shutdown";
import { useToast } from "@/components/ui/toast";

export function CloseDayButton() {
  const pushToast = useToast();
  const [pending, startTransition] = useTransition();

  const close = () => {
    const fd = new FormData();
    startTransition(async () => {
      const res = await closeDay(fd);
      if (!res.ok) pushToast({ message: res.error });
      else pushToast({ message: "Day closed." });
    });
  };

  return (
    <button
      onClick={close}
      disabled={pending}
      className="min-h-[48px] w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-accent-fg disabled:opacity-50"
    >
      {pending ? "Closing…" : "Close the day ✓"}
    </button>
  );
}

export function ReopenDayButton() {
  const pushToast = useToast();
  const [pending, startTransition] = useTransition();

  const reopen = () => {
    startTransition(async () => {
      const res = await reopenDay();
      if (!res.ok) pushToast({ message: res.error });
      else pushToast({ message: "Day reopened." });
    });
  };

  return (
    <button
      onClick={reopen}
      disabled={pending}
      className="mx-auto block min-h-[44px] px-4 py-2 text-sm text-muted transition-colors hover:text-text disabled:opacity-50"
    >
      {pending ? "Reopening…" : "Reopen today"}
    </button>
  );
}
