import type { ViewLayout, ViewPref } from "@/lib/validation/prefs";

/**
 * Board/List resolution order (ROADMAP-V2 D1/D2):
 * 1. `?view=list|board` — overrides for this visit only, never saved.
 * 2. The user's saved pref for this board.
 * 3. `null` ("auto") — the caller renders both and lets `md:` CSS pick
 *    (phone = List, tablet/desktop = Board), so there is no layout flash
 *    and no JS width-sniffing on the server.
 */
export function resolveInitialLayout(
  queryLayout: string | undefined,
  pref: ViewPref | undefined,
): ViewLayout | null {
  if (queryLayout === "board" || queryLayout === "list") return queryLayout;
  if (pref?.layout === "board" || pref?.layout === "list") return pref.layout;
  return null;
}
