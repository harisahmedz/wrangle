const VERSION = "wrangle-v2";
const STATIC_CACHE = `${VERSION}-static`;
const META_CACHE = `${VERSION}-meta`;
const PAGE_PREFIX = `${VERSION}-pages-`;
const OFFLINE_URL = "/offline.html";
const SCOPE_KEY = "/__wrangle_cache_scope__";
// Voice notes (V3 S7): the Whisper model cache transformers.js owns
// (lib/voice/model.ts), and the hand-off stash for audio shared into the app
// (lib/voice/share.ts). Neither is versioned with the SW, so activate() keeps them.
const KEEP_CACHES = ["wrangle-voice", "wrangle-share"];
const SHARE_PATH = "/share";
const SHARE_CACHE = "wrangle-share";
const SHARE_KEY = "/__wrangle_shared_audio__";
const SHARE_MAX_BYTES = 50 * 1024 * 1024;

const PRIVATE_PREFIXES = [
  "/today",
  "/upcoming",
  "/shutdown",
  "/weekly",
  "/wrapped",
  "/boards",
  "/money",
  "/learn",
  "/settings",
  "/p",
  "/trash",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION) && !KEEP_CACHES.includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isPrivatePath(pathname) {
  return PRIVATE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

async function clearPrivateCaches() {
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith(PAGE_PREFIX) || key === META_CACHE)
      .map((key) => caches.delete(key)),
  );
}

async function setScope(scope, expires) {
  const cacheName = `${PAGE_PREFIX}${encodeURIComponent(scope)}`;
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith(PAGE_PREFIX) && key !== cacheName)
      .map((key) => caches.delete(key)),
  );
  const meta = await caches.open(META_CACHE);
  await meta.put(
    SCOPE_KEY,
    new Response(JSON.stringify({ cacheName, expires }), {
      headers: { "Content-Type": "application/json" },
    }),
  );
}

async function currentPageCache() {
  const meta = await caches.open(META_CACHE);
  const response = await meta.match(SCOPE_KEY);
  if (!response) return null;
  const value = await response.json();
  if (!value.cacheName || !value.expires || Date.now() >= Date.parse(value.expires)) {
    await clearPrivateCaches();
    return null;
  }
  return caches.open(value.cacheName);
}

function canCachePage(response, requestedUrl) {
  if (!response.ok || response.redirected) return false;
  if (!response.headers.get("content-type")?.includes("text/html")) return false;
  return new URL(response.url).pathname === requestedUrl.pathname;
}

async function cachePage(urlValue) {
  const url = new URL(urlValue, self.location.origin);
  if (url.origin !== self.location.origin || !isPrivatePath(url.pathname)) return;
  const pageCache = await currentPageCache();
  if (!pageCache) return;
  const request = new Request(url.href, {
    credentials: "include",
    headers: { Accept: "text/html" },
  });
  const response = await fetch(request);
  if (canCachePage(response, url)) await pageCache.put(request, response);
}

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (event.data?.type === "CLEAR_PRIVATE_CACHES") {
    event.waitUntil(clearPrivateCaches());
    return;
  }
  if (event.data?.type === "SET_CACHE_SCOPE") {
    event.waitUntil(
      setScope(event.data.scope, event.data.expires).then(() =>
        event.data.url ? cachePage(event.data.url) : undefined,
      ),
    );
  }
});

function isStatic(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icon-") ||
    url.pathname === "/apple-touch-icon.png" ||
    /\.(?:css|js|woff2?|svg|png|jpg|jpeg|webp|ico)$/.test(url.pathname)
  );
}

// The manifest's share_target (app/manifest.ts) POSTs multipart form data here.
// Keep the audio on the device: stash it in the Cache API for the Dump to
// collect (lib/voice/share.ts) and send the browser to /today?voice=1. A text
// share (no file) is forwarded as query params the way the old GET target was.
// Nothing reaches the server.
async function receiveShare(request) {
  const target = new URL("/today", self.location.origin);
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    if (audio && typeof audio !== "string" && audio.size > 0 && audio.size <= SHARE_MAX_BYTES) {
      const cache = await caches.open(SHARE_CACHE);
      await cache.put(
        SHARE_KEY,
        new Response(audio, {
          headers: {
            "Content-Type": audio.type || "application/octet-stream",
            "X-Wrangle-Name": encodeURIComponent(audio.name || ""),
          },
        }),
      );
      target.searchParams.set("voice", "1");
    } else {
      for (const [from, to] of [["title", "title"], ["text", "text"], ["url", "link"]]) {
        const value = form.get(from);
        if (typeof value === "string" && value) target.searchParams.set(to, value.slice(0, 1000));
      }
    }
  } catch {}
  return Response.redirect(target.href, 303);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.method === "POST" && url.pathname === SHARE_PATH) {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== "GET" || url.pathname.startsWith("/api/")) return;

  if (isStatic(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone()));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate" && isPrivatePath(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          const pageCache = await currentPageCache();
          if (pageCache && canCachePage(response, url)) {
            await pageCache.put(request, response.clone());
          }
          return response;
        })
        .catch(async () => {
          const pageCache = await currentPageCache();
          const hit =
            (await pageCache?.match(request)) ??
            (await pageCache?.match(request, { ignoreSearch: true }));
          return (
            hit ??
            (await caches.match(OFFLINE_URL)) ??
            new Response("Offline", { status: 503 })
          );
        }),
    );
  }
});
