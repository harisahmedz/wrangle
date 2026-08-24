"use client";

import { useTransition } from "react";
import {
  clearCardFocus,
  setCardFocus,
} from "@/lib/actions/shutdown";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/actions/types";

export type FocusedCard = {
  id: string;
  title: string;
  projectName: string;
};

export type FocusCandidate = {
  id: string;
  title: string;
  projectName: string;
  dueAt: Date;
  overdue: boolean;
};

const MAX_FOCUS = 3;

export function FocusPicker({
  focused,
  candidates,
}: {
  focused: FocusedCard[];
  candidates: FocusCandidate[];
}) {
  const pushToast = useToast();
  const [pending, startTransition] = useTransition();
  const full = focused.length >= MAX_FOCUS;

  const run = (
    action: (fd: FormData) => Promise<ActionResult>,
    cardId: string,
    failureMessage?: string,
  ) => {
    const fd = new FormData();
    fd.set("cardId", cardId);
    startTransition(async () => {
      const res = await action(fd);
      if (!res.ok && failureMessage) pushToast({ message: res.error });
    });
  };

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Plan today
        </h2>
        <span className="text-xs text-muted">
          {focused.length}/{MAX_FOCUS} focused
        </span>
      </div>

      {focused.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-surface/50 px-4 py-6 text-center text-sm text-muted">
          Nothing planned yet — pick up to 3.
        </p>
      ) : (
        <ul className="space-y-2">
          {focused.map((card) => (
            <li key={card.id}>
              <button
                onClick={() => run(clearCardFocus, card.id)}
                disabled={pending}
                aria-label={`Unfocus ${card.title}`}
                className="flex min-h-[44px] w-full items-center gap-2.5 rounded-lg border border-accent-strong/40 bg-surface px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-2 disabled:opacity-50"
              >
                <span
                  aria-hidden
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] text-accent-fg"
                >
                  ✓
                </span>
                <span className="min-w-0 flex-1 truncate">{card.title}</span>
                <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
                  {card.projectName}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {candidates.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="px-1 text-xs font-medium text-muted">
            {full
              ? "Focus is full — unfocus one to swap."
              : "Tap a card to focus it."}
          </p>
          <ul className="space-y-1.5">
            {candidates.map((card) => (
              <li key={card.id}>
                <button
                  onClick={() =>
                    run(setCardFocus, card.id, "Couldn't focus the card")
                  }
                  disabled={pending || full}
                  aria-label={`Focus ${card.title}`}
                  className="flex min-h-[44px] w-full items-center gap-2.5 rounded-md border border-border bg-surface px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2 disabled:opacity-50"
                >
                  <span
                    aria-hidden
                    className="h-5 w-5 shrink-0 rounded-full border border-border"
                  />
                  <span className="min-w-0 flex-1 truncate">{card.title}</span>
                  <span
                    className={
                      card.overdue
                        ? "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium bg-danger/15 text-danger"
                        : "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium bg-surface-2 text-muted"
                    }
                  >
                    {card.overdue
                      ? "Overdue"
                      : card.dueAt.toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
