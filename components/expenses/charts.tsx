import { formatMinor } from "@/lib/money";
import { ACCENT_HEX } from "@/lib/palette";

export function Donut({
  slices,
}: {
  slices: Array<{ label: string; value: number; color: string | null }>;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) {
    return (
      <div className="flex h-36 items-center justify-center text-sm text-muted">
        No spending this month
      </div>
    );
  }

  const R = 56;
  const C = 2 * Math.PI * R;
  const arcs = slices.map((s) => ({ ...s, dash: (s.value / total) * C }));
  const offsets = arcs.map((_, i) =>
    arcs.slice(0, i).reduce((sum, a) => sum + a.dash, 0),
  );

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0" role="img" aria-label="Spending by category">
        {arcs.map((a, i) => (
          <circle
            key={i}
            cx="70"
            cy="70"
            r={R}
            fill="none"
            stroke={a.color ?? ACCENT_HEX}
            strokeWidth="18"
            strokeDasharray={`${a.dash} ${C - a.dash}`}
            strokeDashoffset={-offsets[i]}
            transform="rotate(-90 70 70)"
          />
        ))}
        <text x="70" y="66" textAnchor="middle" className="fill-[var(--muted)] text-[10px]">
          Total
        </text>
        <text x="70" y="82" textAnchor="middle" className="fill-[var(--text)] font-semibold text-[13px]">
          {formatMinor(total)}
        </text>
      </svg>

      <ul className="min-w-0 flex-1 space-y-1.5">
        {slices.map((s, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: s.color ?? ACCENT_HEX }}
            />
            <span className="truncate">{s.label}</span>
            <span className="ml-auto shrink-0 tabular-nums text-muted">
              {Math.round((s.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TrendBars({
  months,
  currency = "USD",
}: {
  months: Array<{ key: string; total: number }>;
  currency?: string;
}) {
  const max = Math.max(1, ...months.map((m) => m.total));

  return (
    <div className="flex items-end gap-2" style={{ height: 96 }} role="img" aria-label="Six-month trend">
      {months.map((m) => {
        const h = Math.round((m.total / max) * 72);
        return (
          <div key={m.key} className="group flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-[10px] tabular-nums text-muted opacity-0 transition-opacity group-hover:opacity-100">
              {formatMinor(m.total, currency)}
            </span>
            <div
              className="w-full max-w-10 rounded-t-md bg-accent/70 transition-colors group-hover:bg-accent"
              style={{ height: Math.max(2, h) }}
            />
            <span className="text-[10px] text-muted">
              {new Date(`${m.key}-01T00:00:00Z`).toLocaleDateString("en-US", {
                month: "short",
                timeZone: "UTC",
              })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
