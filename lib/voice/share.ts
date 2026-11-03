// Share target hand-off (ROADMAP-V3 §7, S7). Android's share sheet POSTs the
// audio file to /share; public/sw.js intercepts that, stashes the file here and
// redirects to /today?voice=1, where the Dump collects it with `takeSharedAudio`.
// The names below are duplicated in public/sw.js (plain JS, no imports).

const SHARE_CACHE = "wrangle-share";
const SHARE_KEY = "/__wrangle_shared_audio__";

/** Returns the shared file once and deletes the stash, or null when there is none. */
export async function takeSharedAudio(): Promise<File | null> {
  if (!("caches" in window) || !(await caches.has(SHARE_CACHE))) return null;
  const cache = await caches.open(SHARE_CACHE);
  const response = await cache.match(SHARE_KEY);
  if (!response) return null;
  await cache.delete(SHARE_KEY);
  const blob = await response.blob();
  const name = decodeURIComponent(response.headers.get("x-wrangle-name") ?? "") || "shared-audio";
  return new File([blob], name, { type: blob.type });
}
