"use client";

import { useEffect, useState } from "react";
import { useAiAvailable } from "@/lib/ai";
import { findCodeMatch, type IdeaRef } from "@/lib/kanban/duplicate-idea";

/**
 * "Looks like …" hint after adding an idea (V3 S5 / A5). Loaded lazily by
 * `InlineAdd` on the first add so `lib/ai` stays out of first-load chunks.
 * Step 1 is the code match; only without one, and with AI available, one
 * `same-idea` call runs. Aborted on unmount (navigating away); never blocks.
 */
export default function DuplicateIdeaHint({
  title,
  ideas,
  onOpenCard,
}: {
  title: string;
  ideas: IdeaRef[];
  onOpenCard?: (id: string) => void;
}) {
  const [codeMatch] = useState(() => findCodeMatch(title, ideas));
  const [aiMatch, setAiMatch] = useState<IdeaRef | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const { available } = useAiAvailable();

  useEffect(() => {
    if (codeMatch || !available || ideas.length === 0) return;
    const ctl = new AbortController();
    void (async () => {
      const [{ runTask }, { sameIdeaTask, buildSameInput, pickSame }] = await Promise.all([
        import("@/lib/ai"),
        import("@/lib/ai/tasks/same-idea"),
      ]);
      const { input, refs } = buildSameInput(title, ideas);
      const r = await runTask(sameIdeaTask, input, { signal: ctl.signal });
      if (!r.ok || ctl.signal.aborted) return;
      setAiMatch(pickSame(r.data.same, refs));
    })();
    return () => ctl.abort();
  }, [codeMatch, available, title, ideas]);

  const match = codeMatch ?? aiMatch;
  if (!match || dismissed) return null;
  return (
    <div
      role="status"
      className="mt-1 flex flex-wrap items-center gap-x-2 rounded-md bg-surface-2 px-2 py-1 text-xs text-muted"
    >
      <span className="min-w-0 flex-1 break-words">Looks like “{match.title}”</span>
      {onOpenCard && (
        <button
          type="button"
          onClick={() => onOpenCard(match.id)}
          className="min-h-11 px-1 font-medium text-accent hover:underline"
        >
          Open
        </button>
      )}
      <button type="button" onClick={() => setDismissed(true)} className="min-h-11 px-1 hover:text-text">
        Dismiss
      </button>
    </div>
  );
}
