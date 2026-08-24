"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLearningStatus } from "@/lib/actions/learning";
import { nextStatus, prevStatus } from "@/lib/learning/logic";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export type LearnItemRow = {
  id: string;
  title: string;
  type: string;
  status: "want" | "learning" | "learned";
  sourceUrl: string | null;
  whyNote: string | null;
  targetDate: string | null;
  progressPct: number;
  hoursLogged: string;
};

const TYPE_EMOJI: Record<string, string> = {
  course: "🎓",
  book: "📖",
  video: "🎬",
  article: "📰",
  skill: "🛠️",
  other: "📦",
};

export function PipelineCard({ item }: { item: LearnItemRow }) {
  const [, startTransition] = useTransition();
  const pushToast = useToast();
  const router = useRouter();
  const advanceTo = nextStatus(item.status);
  const backTo = prevStatus(item.status);

  const move = (status: "want" | "learning" | "learned", celebrate?: boolean) => {
    const fd = new FormData();
    fd.set("itemId", item.id);
    fd.set("status", status);
    startTransition(async () => {
      await setLearningStatus(fd);
    });
    if (celebrate) pushToast({ message: `🎉 Learned: ${item.title}` });
  };

  const open = () =>
    router.push(`/learn?item=${item.id}`, { scroll: false });

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => e.key === "Enter" && open()}
      className="group cursor-pointer rounded-lg border border-border bg-surface p-3 text-sm shadow-sm transition-colors hover:border-muted/50"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 break-words">
          <span aria-hidden className="mr-1.5">
            {TYPE_EMOJI[item.type] ?? "📦"}
          </span>
          {item.title}
        </p>
        <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] tabular-nums text-muted">
          {item.hoursLogged}h
        </span>
      </div>

      {item.status !== "want" && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className={cn(
              "h-full rounded-full",
              item.progressPct === 100 ? "bg-emerald-500" : "bg-accent",
            )}
            style={{ width: `${item.progressPct}%` }}
          />
        </div>
      )}
      {item.targetDate && (
        <p className="mt-1.5 text-xs text-muted">
          Target{" "}
          {new Date(`${item.targetDate}T12:00:00Z`).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          })}
        </p>
      )}

      <div className="mt-2 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {backTo && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              move(backTo);
            }}
            aria-label="Move back"
            className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted hover:text-text"
          >
            ← {backTo}
          </button>
        )}
        {advanceTo && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              move(advanceTo, advanceTo === "learned");
            }}
            aria-label={`Move to ${advanceTo}`}
            className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-strong"
          >
            → {advanceTo === "learned" ? "Learned 🎉" : advanceTo}
          </button>
        )}
      </div>
    </div>
  );
}
