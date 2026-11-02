/**
 * Runs `cb` once the browser is idle after load (V3 S8b). Used to warm lazy
 * chunks so they are in memory before the user needs them, including after
 * going offline mid-session. Returns a cancel function for effect cleanup.
 */
export function onIdle(cb: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(cb, { timeout: 5000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(cb, 2000);
  return () => window.clearTimeout(id);
}
