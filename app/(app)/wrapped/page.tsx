import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/authz";
import { loadWrappedMonth } from "@/lib/actions/wrapped";
import {
  currentMonthParts,
  formatYearMonth,
  isAfterMonth,
  monthLabelFromParts,
  parseMonthKey,
  shiftMonth,
} from "@/lib/wrapped/month";
import { WrappedDeck } from "@/components/wrapped/deck";
import { WrappedGateView } from "@/components/wrapped/gate";

type Props = { searchParams: Promise<{ m?: string }> };

export const metadata: Metadata = { title: "Life Wrapped" };

export default async function WrappedPage({ searchParams }: Props) {
  const userId = await requireUser();

  const [user] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const timeZone = user?.timezone || "UTC";

  const sp = await searchParams;
  const current = currentMonthParts(new Date(), timeZone);
  const requested = sp.m ? parseMonthKey(sp.m) : null;
  const target =
    requested && !isAfterMonth(requested, current) ? requested : current;

  const payload = await loadWrappedMonth(timeZone, target.year, target.monthIndex);

  const prev = shiftMonth(target.year, target.monthIndex, -1);
  const next = shiftMonth(target.year, target.monthIndex, 1);
  const hasNext = isAfterMonth(current, target);
  const label = monthLabelFromParts(target.year, target.monthIndex);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Life Wrapped</h1>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
          <Link
            href={`/wrapped?m=${formatYearMonth(prev.year, prev.monthIndex)}`}
            aria-label="Previous month"
            className="rounded px-2 py-1 text-muted hover:text-text"
          >
            ←
          </Link>
          <span className="min-w-32 text-center text-sm font-medium">{label}</span>
          {hasNext ? (
            <Link
              href={`/wrapped?m=${formatYearMonth(next.year, next.monthIndex)}`}
              aria-label="Next month"
              className="rounded px-2 py-1 text-muted hover:text-text"
            >
              →
            </Link>
          ) : (
            <span aria-hidden className="px-2 py-1 opacity-30">→</span>
          )}
        </div>
      </div>

      {payload.status === "ready" ? (
        <WrappedDeck
          monthLabel={payload.monthLabel}
          stats={payload.stats}
          archetype={payload.archetype}
        />
      ) : (
        <WrappedGateView gate={payload} />
      )}
    </div>
  );
}
