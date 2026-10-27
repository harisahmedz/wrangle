"use client";

import { useEffect } from "react";

/**
 * Sets the installed PWA's app icon badge to the overdue+due-today open
 * card count (V2 S7), feature-detected (`navigator.setAppBadge` is Chromium/
 * Edge/installed-PWA only). `count` comes from a server component (see
 * app/(app)/layout.tsx) that re-renders, and so re-runs this effect, on a
 * reload or a server action's `refresh()` (not on client navigation). That
 * is how completing an overdue card clears/lowers the badge without extra
 * client-side wiring.
 */
export function AppBadge({ count }: { count: number }) {
  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    if (count > 0) {
      navigator.setAppBadge(count).catch(() => {});
    } else {
      navigator.clearAppBadge?.().catch(() => {});
    }
  }, [count]);

  return null;
}
