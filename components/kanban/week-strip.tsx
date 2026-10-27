import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { WeekStripDay } from "@/lib/kanban/upcoming";

/**
 * 7 day pills for Upcoming's agenda (V2 S6), `md`+ only (the brief: on
 * phone the strip collapses to just the list). Pure presentational —
 * tapping a pill is a same-page anchor link (`#day-<key>`), no JS needed.
 */
export function WeekStrip({
  days,
  prevHref,
  nextHref,
}: {
  days: WeekStripDay[];
  prevHref: string;
  nextHref: string;
}) {
  return (
    <div className="hidden items-center gap-1 md:flex">
      <Link
        href={prevHref}
        aria-label="Previous week"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
      >
        <ChevronLeftIcon className="h-4 w-4" />
      </Link>
      <div className="grid flex-1 grid-cols-7 gap-1">
        {days.map((day) => (
          <a
            key={day.key}
            href={day.hasCards ? `#day-${day.key}` : undefined}
            aria-disabled={!day.hasCards}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg border border-border px-2 py-2 transition-colors",
              day.hasCards ? "hover:bg-surface-2" : "cursor-default",
              day.isToday && "border-accent bg-accent/10",
            )}
          >
            <span className="text-xs font-medium uppercase text-muted">
              {day.weekday}
            </span>
            <span
              className={cn(
                "text-sm font-semibold",
                day.isToday && "text-accent-strong",
              )}
            >
              {day.date}
            </span>
            <span
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                day.hasCards ? "bg-accent" : "bg-transparent",
              )}
            />
          </a>
        ))}
      </div>
      <Link
        href={nextHref}
        aria-label="Next week"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
      >
        <ChevronRightIcon className="h-4 w-4" />
      </Link>
    </div>
  );
}
