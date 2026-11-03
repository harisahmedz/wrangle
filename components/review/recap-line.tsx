"use client";

// The AI recap under Weekly / Wrapped (B91). Renders nothing unless AI is on
// and a checked line exists; the template text on the page is the fallback.
// Accepted lines are cached per period + facts in sessionStorage.
import { useEffect, useState } from "react";
import { useAiAvailable } from "@/lib/ai";

export function RecapLine({
  periodId,
  period,
  facts,
}: {
  /** User-agnostic id of the period, e.g. "w:2026-10-26" or "m:2026-10". */
  periodId: string;
  period: "week" | "month";
  facts: string[];
}) {
  const { available } = useAiAvailable();
  const [line, setLine] = useState<string | null>(null);
  const factsKey = facts.join("\n");

  useEffect(() => {
    const facts = factsKey.split("\n");
    if (!available || facts.length < 2) return;
    const ctrl = new AbortController();
    (async () => {
      const { hashFacts, checkRecapLine, recapTask } = await import("@/lib/ai/tasks/recap");
      const key = `wrangle-recap:${periodId}:${hashFacts(facts)}`;
      try {
        const cached = sessionStorage.getItem(key);
        if (cached) return setLine(cached);
      } catch {}
      const { runTask } = await import("@/lib/ai");
      const r = await runTask(recapTask, { period, facts }, { signal: ctrl.signal });
      if (!r.ok) return;
      const checked = checkRecapLine(r.data.line, facts);
      if (!checked) return;
      try {
        sessionStorage.setItem(key, checked);
      } catch {}
      setLine(checked);
    })();
    return () => ctrl.abort();
  }, [available, periodId, period, factsKey]);

  if (!available || !line) return null;
  return (
    <p className="flex items-start gap-2 text-sm text-text">
      <span
        title="Written by AI from the numbers on this page"
        className="mt-0.5 shrink-0 rounded border border-border px-1 text-xs font-medium text-muted"
      >
        AI
      </span>
      <span>{line}</span>
    </p>
  );
}
