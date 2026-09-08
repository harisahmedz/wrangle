"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { promoteIdea } from "@/lib/kanban/phase3-actions";
import { rescheduleOverdueToNextWeek } from "@/lib/actions/weekly";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function RescheduleAllButton({ slippedCount }: { slippedCount: number }) {
  const pushToast = useToast();
  const [pending, startTransition] = useTransition();

  const run = () => {
    startTransition(async () => {
      const res = await rescheduleOverdueToNextWeek();
      if (!res.ok) {
        pushToast({ message: res.error });
        return;
      }
      pushToast({
        message:
          res.data.count === 1
            ? "1 task moved to next week"
            : `${res.data.count} tasks moved to next week`,
      });
    });
  };

  return (
    <Button variant="secondary" size="sm" onClick={run} disabled={pending}>
      {pending ? "Rescheduling…" : `Reschedule all to next week (${slippedCount})`}
    </Button>
  );
}

export function PromoteTopIdeaButton({ cardId }: { cardId: string }) {
  const pushToast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = () => {
    const fd = new FormData();
    fd.set("cardId", cardId);
    startTransition(async () => {
      const res = await promoteIdea(fd);
      if (!res.ok) {
        pushToast({ message: res.error });
        return;
      }
      router.refresh();
      pushToast({ message: "Promoted to To-Do" });
    });
  };

  return (
    <Button variant="secondary" size="sm" onClick={run} disabled={pending}>
      {pending ? "Promoting…" : "Promote"}
    </Button>
  );
}
