/**
 * Reserved `views` key for the personal Learn pipeline/list switch (V2 S4b,
 * backlog B80) — Learn has no board id of its own (it's per-user, not
 * per-project), so it shares the same `{ views: { [key]: ViewPref } }` shape
 * under this fixed string instead of a board uuid. `setViewPref` skips the
 * board-membership check for this one key.
 */
export const LEARN_VIEW_KEY = "learn";
