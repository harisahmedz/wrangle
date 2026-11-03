"use client";

// Plan my week (V3 S6, backlog B93, ROADMAP-V3 §6): the proposal sheet on
// /upcoming. PlanButton loads this module lazily, so lib/plan and the AI
// task stay out of first-load JS. The scheduler proposes; nothing changes
// until "Apply", which queues one `card.update` per checked row through
// mutate() — so it works offline. The optional AI step only picks which
// cards matter for the user's focus sentence; it never sees a date.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAiAvailable } from "@/lib/ai";
import { localDateKey, shiftDateKey } from "@/lib/dates";
import { PRIORITY_RING_CLASS } from "@/lib/kanban/priority";
import { mutate } from "@/lib/mutations";
import { useOutbox } from "@/lib/outbox/client";
import type { PlanMove } from "@/lib/plan/schedule";
import type { PlanInput, PlanInputCard } from "@/lib/plan/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

type Scheduler = typeof import("@/lib/plan/schedule");

type AiState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; count: number }
  | { kind: "failed" };

/** Mirrors PLAN_FOCUS_MAX in lib/ai/tasks/plan-focus.ts (imported lazily, inside the handler). */
const FOCUS_MAX = 200;

/** "Today" / "Tomorrow" / "Thu 29 Oct" — same wording as Upcoming's day headers. */
function dayLabel(key: string, todayKey: string): string {
  if (key === todayKey) return "Today";
  if (key === shiftDateKey(todayKey, 1)) return "Tomorrow";
  if (key === shiftDateKey(todayKey, -1)) return "Yesterday";
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(date);
  return `${fmt({ weekday: "short" })} ${d} ${fmt({ month: "short" })}`;
}

export function PlanSheet({ input, onClose }: { input: PlanInput; onClose: () => void }) {
  const { timeZone, todayKey, dailyCap, weekendCap, candidates } = input;
  const router = useRouter();
  const pushToast = useToast();
  const { offline } = useOutbox();
  const ai = useAiAvailable();

  const [sched, setSched] = useState<Scheduler | null>(null);
  const [focus, setFocus] = useState("");
  const [pinned, setPinned] = useState<string[]>([]);
  const [aiState, setAiState] = useState<AiState>({ kind: "idle" });
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("@/lib/plan/schedule").then((m) => {
      if (!cancelled) setSched(m);
    });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, []);

  const cardById = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);

  const plan: PlanMove[] = useMemo(
    () =>
      sched
        ? sched.scheduleWeek(candidates, { todayKey, timeZone, dailyCap, weekendCap, pinned })
        : [],
    [sched, candidates, todayKey, timeZone, dailyCap, weekendCap, pinned],
  );

  const groups = useMemo(() => {
    if (!sched) return [];
    return sched
      .planDays(todayKey)
      .map((key) => ({
        key,
        cap: sched.capForDay(key, dailyCap, weekendCap),
        moves: plan.filter((m) => m.to === key),
      }))
      .filter((g) => g.moves.length > 0);
  }, [sched, plan, todayKey, dailyCap, weekendCap]);

  const planned = useMemo(() => new Set(plan.map((m) => m.cardId)), [plan]);
  const unplaced = candidates.filter((c) => !planned.has(c.id)).length;
  const changes = sched ? plan.filter((m) => sched.isChange(m, timeZone) && !unchecked.has(m.cardId)) : [];

  const toggle = (cardId: string) =>
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });

  const runFocus = async () => {
    const sentence = focus.trim();
    if (!sentence || !ai.available) return;
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setAiState({ kind: "running" });
    try {
      const [{ runTask }, task] = await Promise.all([import("@/lib/ai"), import("@/lib/ai/tasks/plan-focus")]);
      const titles = candidates.map((c) => c.title);
      const r = await runTask(task.planFocusTask, { focus: sentence, titles }, { signal: ctl.signal });
      if (ctl.signal.aborted) return;
      if (!r.ok) {
        setPinned([]);
        setAiState({ kind: "failed" });
        return;
      }
      // Code checks the meaning after Zod checked the shape: numbers → the cards actually sent.
      const picks = task.cleanPicks(r.data.pick, titles.length).map((n) => candidates[n - 1].id);
      setPinned(picks);
      setAiState({ kind: "done", count: picks.length });
    } catch {
      if (!ctl.signal.aborted) setAiState({ kind: "failed" });
    }
  };

  const clearFocus = () => {
    abortRef.current?.abort();
    setPinned([]);
    setAiState({ kind: "idle" });
  };

  const apply = async () => {
    if (!sched || changes.length === 0) return;
    setApplying(true);
    let n = 0;
    for (const m of changes) {
      const card = cardById.get(m.cardId);
      if (!card) continue;
      const res = await mutate(
        { kind: "card.update", cardId: m.cardId, patch: sched.duePatchFor(m, timeZone) },
        `Move “${card.title}” to ${dayLabel(m.to, todayKey)}`,
      );
      if (res.ok) n++;
    }
    setApplying(false);
    const noun = n === 1 ? "change" : "changes";
    pushToast({
      message: offline ? `Planned ${n} ${noun} — syncs when you're back online` : `Planned ${n} ${noun}`,
    });
    onClose();
    if (navigator.onLine) router.refresh();
  };

  const showFocus = ai.mode !== "off";
  const focusHint = ai.available
    ? null
    : ai.offline
      ? "AI focus needs a connection. Planning still works."
      : "No AI provider on this device (Settings → AI). Planning still works.";

  return (
    <Sheet open onClose={onClose} label="Plan my week" className="sm:max-w-lg">
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Plan my week</h2>
          <p className="text-xs text-muted">
            Up to {dailyCap} {dailyCap === 1 ? "card" : "cards"} a weekday and {weekendCap} at the weekend.
            Overdue and undated cards fill the gaps; cards already due this week keep their day when
            there&apos;s room. Change the caps in Settings.
          </p>
        </div>

        {showFocus && (
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <Input
                value={focus}
                maxLength={FOCUS_MAX}
                placeholder="This week I want to…"
                aria-label="Focus for this week"
                disabled={!ai.available || aiState.kind === "running"}
                onChange={(e) => setFocus(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void runFocus();
                  }
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void runFocus()}
                disabled={!ai.available || !focus.trim() || aiState.kind === "running"}
              >
                {aiState.kind === "running" ? "Picking…" : "Focus"}
              </Button>
            </div>
            <p aria-live="polite" className="min-h-4 text-xs text-muted">
              {focusHint ??
                (aiState.kind === "done" ? (
                  <>
                    {aiState.count === 0
                      ? "Nothing matched that focus; planned without picks."
                      : `AI picked ${aiState.count} ${aiState.count === 1 ? "card" : "cards"} for your focus and put them first.`}{" "}
                    <button type="button" onClick={clearFocus} className="font-semibold text-accent-strong hover:underline">
                      Clear
                    </button>
                  </>
                ) : aiState.kind === "failed" ? (
                  "Couldn't get AI picks; planned without them."
                ) : (
                  "Optional. The AI only chooses which cards matter; the dates are computed here."
                ))}
            </p>
          </div>
        )}

        {!sched ? (
          <p className="text-sm text-muted">Working out your week…</p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing to plan: no open cards are overdue, due this week, or waiting undated in My Space or
            assigned to you.
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <section key={g.key} className="space-y-1">
                <h3 className="flex items-baseline justify-between text-sm font-medium text-muted">
                  <span>{dayLabel(g.key, todayKey)}</span>
                  <span className="text-xs">
                    {g.moves.length}/{g.cap}
                  </span>
                </h3>
                <ul>
                  {g.moves.map((m) => (
                    <Row
                      key={m.cardId}
                      card={cardById.get(m.cardId)!}
                      move={m}
                      changed={sched.isChange(m, timeZone)}
                      checked={!unchecked.has(m.cardId)}
                      pinned={pinned.includes(m.cardId)}
                      todayKey={todayKey}
                      timeZone={timeZone}
                      onToggle={() => toggle(m.cardId)}
                    />
                  ))}
                </ul>
              </section>
            ))}
            {unplaced > 0 && (
              <p className="text-xs text-muted">
                {unplaced} {unplaced === 1 ? "card doesn't" : "cards don't"} fit this week and{" "}
                {unplaced === 1 ? "stays" : "stay"} as {unplaced === 1 ? "it is" : "they are"}.
              </p>
            )}
          </div>
        )}

        {/* Sticky like the other sheets' footers, so Apply is reachable without scrolling a long week. */}
        <div className="sticky bottom-0 -mx-5 -mb-[calc(1.25rem+env(safe-area-inset-bottom))] flex items-center justify-end gap-2 border-t border-border bg-surface px-5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-3 sm:-mb-5">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void apply()} disabled={!sched || applying || changes.length === 0}>
            {applying
              ? "Applying…"
              : `Apply ${changes.length} ${changes.length === 1 ? "change" : "changes"}`}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

function Row({
  card,
  move,
  changed,
  checked,
  pinned,
  todayKey,
  timeZone,
  onToggle,
}: {
  card: PlanInputCard;
  move: PlanMove;
  changed: boolean;
  checked: boolean;
  pinned: boolean;
  todayKey: string;
  timeZone: string;
  onToggle: () => void;
}) {
  const fromLabel = move.from === null ? "No date" : dayLabel(localDateKey(new Date(move.from), timeZone), todayKey);
  const ring = card.priority ? PRIORITY_RING_CLASS[card.priority] : "border-border";
  const body = (
    <>
      <span aria-hidden className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border", ring)} />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm", changed && !checked && "text-muted line-through")}>
          {card.title}
          {pinned && (
            <span className="ml-1.5 rounded bg-accent/15 px-1 text-[10px] font-medium uppercase text-accent-strong">
              focus
            </span>
          )}
        </span>
        <span className="block truncate text-xs text-muted">
          {card.projectName} ·{" "}
          {changed ? (
            <>
              <span className={move.from === null ? "" : "text-danger"}>{fromLabel}</span> →{" "}
              <span className="text-success">{dayLabel(move.to, todayKey)}</span>
            </>
          ) : (
            "stays"
          )}
        </span>
      </span>
    </>
  );
  return (
    <li className="border-b border-border last:border-b-0">
      {changed ? (
        <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            className="mt-1 h-4 w-4 shrink-0 accent-accent"
            aria-label={`Move ${card.title}`}
          />
          {body}
        </label>
      ) : (
        <div className="flex min-h-11 items-start gap-3 py-2 pl-7">{body}</div>
      )}
    </li>
  );
}
