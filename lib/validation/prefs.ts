import { z } from "zod";

/**
 * users.prefs shape (ROADMAP-V2 D1, F1): `{ views: { [boardId]: ViewPref } }`.
 * The key is a plain string so S4b can add `views.learn` without a schema
 * change — only the board page validates/resolves board-id keys today.
 */
export const VIEW_LAYOUTS = ["board", "list"] as const;
export const GROUP_BY_VALUES = ["column", "due", "none"] as const;
export const SORT_VALUES = ["manual", "due", "priority"] as const;

/**
 * Reserved `views` key for the personal Learn pipeline/list switch (V2 S4b,
 * backlog B80) — Learn has no board id of its own (it's per-user, not
 * per-project), so it shares the same `{ views: { [key]: ViewPref } }` shape
 * under this fixed string instead of a board uuid. `setViewPref` skips the
 * board-membership check for this one key.
 */
export const LEARN_VIEW_KEY = "learn";

export type ViewLayout = (typeof VIEW_LAYOUTS)[number];
export type GroupBy = (typeof GROUP_BY_VALUES)[number];
export type SortMode = (typeof SORT_VALUES)[number];

export const viewPrefSchema = z.object({
  layout: z.enum(VIEW_LAYOUTS).optional(),
  groupBy: z.enum(GROUP_BY_VALUES).optional(),
  sort: z.enum(SORT_VALUES).optional(),
  showCompleted: z.boolean().optional(),
});
export type ViewPref = z.infer<typeof viewPrefSchema>;

export const userPrefsSchema = z.object({
  views: z.record(z.string(), viewPrefSchema).optional(),
});
export type UserPrefs = z.infer<typeof userPrefsSchema>;

/** Safe-parses the `users.prefs` jsonb column; missing/malformed data becomes `{}`. */
export function parseUserPrefs(raw: unknown): UserPrefs {
  const parsed = userPrefsSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

/**
 * Pure merge-one-view-into-prefs step. `setViewPref` (`lib/actions/settings.ts`)
 * does the actual write as one atomic `jsonb_set(... || ...)` SQL statement
 * instead of calling this read-then-write (a `SELECT` followed by this
 * function followed by an `UPDATE` could lose a concurrent write from
 * another tab/device) — this function documents and tests that the SQL
 * implements the same shallow-merge-per-field semantics.
 */
export function mergeViewPref(prefs: UserPrefs, key: string, patch: ViewPref): UserPrefs {
  const views = { ...(prefs.views ?? {}) };
  views[key] = { ...(views[key] ?? {}), ...patch };
  return { ...prefs, views };
}
