import { z } from "zod";
import { AI_MODES } from "@/lib/ai/types";
import { LEARN_VIEW_KEY } from "@/lib/view-keys";

// Re-exported for server callers; client components import it from
// @/lib/view-keys so zod stays out of the client bundle.
export { LEARN_VIEW_KEY };

/**
 * users.prefs shape (ROADMAP-V2 D1, F1): `{ views: { [boardId]: ViewPref } }`,
 * plus `ai: { mode }` (ROADMAP-V3 S0) and `plan: { dailyCap, weekendCap }`
 * (ROADMAP-V3 S6). The views key is a plain string so S4b
 * could add `views.learn` without a schema change — only the board page
 * validates/resolves board-id keys today.
 */
export const VIEW_LAYOUTS = ["board", "list"] as const;
export const GROUP_BY_VALUES = ["column", "due", "none"] as const;
export const SORT_VALUES = ["manual", "due", "priority"] as const;

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

/**
 * Settings → AI (ROADMAP-V3 §4, S0). Only the on/off choice syncs; the
 * OpenRouter key itself is device-only (`lib/ai/key-store.ts`) and must never
 * appear here.
 */
export const aiPrefSchema = z.object({
  mode: z.enum(AI_MODES),
});
export type AiPref = z.infer<typeof aiPrefSchema>;

/**
 * Settings → Plan my week (ROADMAP-V3 §6, S6): how many cards the scheduler
 * puts on a weekday and on a weekend day. Defaults match
 * `DEFAULT_DAILY_CAP`/`DEFAULT_WEEKEND_CAP` in lib/plan/schedule.ts (kept
 * separate so the lazy plan chunk never imports zod; a unit test pins them).
 */
export const PLAN_CAP_DEFAULTS = { dailyCap: 5, weekendCap: 2 } as const;
export const PLAN_CAP_MAX = 20;

export const planPrefSchema = z.object({
  dailyCap: z.number().int().min(1).max(PLAN_CAP_MAX).optional(),
  weekendCap: z.number().int().min(0).max(PLAN_CAP_MAX).optional(),
});
export type PlanPref = z.infer<typeof planPrefSchema>;

export const userPrefsSchema = z.object({
  views: z.record(z.string(), viewPrefSchema).optional(),
  ai: aiPrefSchema.optional(),
  plan: planPrefSchema.optional(),
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
