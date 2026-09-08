"use client";

import { useTransition } from "react";
import { closeDay, reopenDay } from "@/lib/actions/shutdown";
import { Button } from "@/components/ui/button";
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
    <Button size="lg" className="w-full" onClick={close} disabled={pending}>
      {pending ? "Closing…" : "Close the day"}
    </Button>
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
    <Button variant="ghost" onClick={reopen} disabled={pending}>
      {pending ? "Reopening…" : "Reopen today"}
    </Button>
  );
}
