import { flushSync } from "react-dom";

/**
 * Runs `update` inside the native View Transitions API when the browser
 * supports it and the user hasn't asked for reduced motion, falling back to
 * a plain synchronous update otherwise. `flushSync` is required because
 * `document.startViewTransition`'s callback must leave the DOM in its final
 * state before returning — a bare `setState` wouldn't commit in time for the
 * browser to snapshot it (V2 S7, see app/globals.css for the paired CSS).
 */
export function withViewTransition(update: () => void) {
  const supported =
    typeof document !== "undefined" &&
    "startViewTransition" in document &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!supported) {
    update();
    return;
  }

  // The callback runs asynchronously, so callers should do any must-run work
  // (e.g. persisting) before calling this, not after.
  document.startViewTransition(() => flushSync(update));
}
