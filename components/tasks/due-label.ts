import { localDateKey, shiftDateKey } from "@/lib/dates";

export type DueTone = "overdue" | "upcoming";

export type DueMeta = { label: string; tone: DueTone };

/** Tailwind color for each tone, shared by TaskRow and FocusPicker. */
export const dueToneClass: Record<DueTone, string> = {
  overdue: "text-danger",
  upcoming: "text-success",
};

/**
 * Formats a due date for the TaskRow meta line as "Today"/"Tomorrow"/
 * "Yesterday" or a short month/day date otherwise. The one due-date
 * formatter for the whole app (V2 S5 folded the board's `CardChip` onto
 * this instead of keeping its own `formatDue`, so Board and List can't
 * drift). `overdue` is computed upstream (timezone-aware, see lib/dates.ts)
 * and only decides the tone.
 *
 * `timeZone` is required (the caller's `users.timezone`, defaulting to
 * "UTC" upstream) so the label always reflects the user's local day
 * rather than the server's or browser's — otherwise SSR (server TZ) and
 * CSR (browser TZ) can render different day labels for the same instant.
 * The locale is pinned to "en-US" for the same reason: an explicit,
 * deterministic format instead of `undefined` (ambient browser locale).
 *
 * `now` defaults to the real current instant but can be passed explicitly
 * (tests do) to keep this otherwise-pure helper deterministic.
 */
export function formatDueLabel(
  dueAt: Date,
  overdue: boolean,
  timeZone: string,
  now: Date = new Date(),
): DueMeta {
  const dueKey = localDateKey(dueAt, timeZone);
  const todayKey = localDateKey(now, timeZone);

  let label: string;
  if (dueKey === todayKey) {
    label = "Today";
  } else if (dueKey === shiftDateKey(todayKey, 1)) {
    label = "Tomorrow";
  } else if (dueKey === shiftDateKey(todayKey, -1)) {
    label = "Yesterday";
  } else {
    label = new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
    }).format(dueAt);
  }

  return { label, tone: overdue ? "overdue" : "upcoming" };
}
