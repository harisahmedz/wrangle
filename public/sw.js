const VERSION = "wrangle-v2";
const STATIC_CACHE = `${VERSION}-static`;
const META_CACHE = `${VERSION}-meta`;
const PAGE_PREFIX = `${VERSION}-pages-`;
const OFFLINE_URL = "/offline.html";
const SCOPE_KEY = "/__wrangle_cache_scope__";

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
          keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)),
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

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

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
