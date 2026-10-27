export type DueTone = "overdue" | "upcoming";

export type DueMeta = { label: string; tone: DueTone };

/** Tailwind color for each tone, shared by TaskRow and FocusPicker. */
export const dueToneClass: Record<DueTone, string> = {
  overdue: "text-danger",
  upcoming: "text-success",
};

/**
 * Formats a due date for the TaskRow meta line. `overdue` is computed
 * upstream (timezone-aware, see lib/dates.ts) and only decides the tone;
 * this stays a pure, easily-testable helper.
 *
 * `timeZone` is required (the caller's `users.timezone`, defaulting to
 * "UTC" upstream) so the label always reflects the user's local day
 * rather than the server's or browser's — otherwise SSR (server TZ) and
 * CSR (browser TZ) can render different day labels for the same instant.
 * The locale is pinned to "en-US" for the same reason: an explicit,
 * deterministic format instead of `undefined` (ambient browser locale).
 */
export function formatDueLabel(
  dueAt: Date,
  overdue: boolean,
  timeZone: string,
): DueMeta {
  return {
    label: new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
    }).format(dueAt),
    tone: overdue ? "overdue" : "upcoming",
  };
}
