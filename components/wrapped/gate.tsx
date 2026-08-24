import type { WrappedGate } from "@/lib/actions/wrapped";

const TEASERS = ["Your archetype", "One plot twist", "Shipped · learned · spent"];

export function WrappedGateView({ gate }: { gate: WrappedGate }) {
  const empty = gate.activeCount === 0;
  const pct = Math.min(
    100,
    Math.round((gate.activeCount / gate.threshold) * 100),
  );

  return (
    <section className="mx-auto max-w-md space-y-6 rounded-xl border border-border bg-surface p-6">
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold tracking-tight">
          {empty
            ? "Your first wrap is waiting"
            : `Your ${gate.monthLabel} wrap is building`}
        </h2>
        <p className="text-sm text-muted">
          {empty
            ? `It unlocks after ${gate.threshold} active days — you're off to a start.`
            : `${gate.activeCount}/${gate.threshold} days so far.`}
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={gate.threshold}
        aria-valuenow={gate.activeCount}
        aria-label="Active days this month"
        className="h-1.5 overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="-mt-3 text-xs tabular-nums text-muted">
        {gate.activeCount}/{gate.threshold} days
      </p>

      <p className="text-sm text-muted">
        An active day is any day you complete a task, log an expense, study,
        or close out your day. No streaks here — every day counts.
      </p>

      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Waiting inside your wrap
        </p>
        <ul className="space-y-1 text-sm text-muted">
          {TEASERS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
