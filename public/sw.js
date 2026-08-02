// Skedio service worker.
//
// This project's build (TanStack Start + Nitro) doesn't produce a
// build-time asset manifest for the service worker to precache, so instead
// of guessing hashed filenames, this worker caches opportunistically as the
// app is used ("runtime caching"). That's a standard, safe pattern here
// specifically because Vite content-hashes every built JS/CSS/image file —
// if a file's content changes, its URL changes too, so caching those
// responses "forever" (cache-first) can never serve stale content. Only the
// navigation document (the HTML shell, which is *not* hashed) needs a
// freshness-aware strategy.
//
// Bump CACHE_VERSION whenever this file's caching *behavior* changes so old
// caches get cleaned up on activate. It does not need to change for normal
// app releases — runtime caching updates itself automatically.
const CACHE_VERSION = 'v1';
const STATIC_CACHE = `skedio-static-${CACHE_VERSION}`;
const SHELL_CACHE = `skedio-shell-${CACHE_VERSION}`;
const CURRENT_CACHES = new Set([STATIC_CACHE, SHELL_CACHE]);

// The path this worker is actually scoped to — "/" at a domain root,
// "/Skedio/" under a GitHub Pages project subpath, etc. Always reflects
// reality (it's what the worker was actually registered with), so building
// every other path from it means this one file works correctly under any
// deployment without needing a build-time rewrite step.
const SCOPE = new URL(self.registration.scope).pathname;

const OFFLINE_URL = `${SCOPE}offline.html`;

// Stable (non-hashed) paths we know ahead of time — safe to precache eagerly.
const PRECACHE_URLS = [
  OFFLINE_URL,
  `${SCOPE}manifest.webmanifest`,
  `${SCOPE}favicon.ico`,
  `${SCOPE}favicon-32.png`,
  `${SCOPE}icons/icon-48.png`,
  `${SCOPE}icons/icon-72.png`,
  `${SCOPE}icons/icon-96.png`,
  `${SCOPE}icons/icon-144.png`,
  `${SCOPE}icons/icon-192.png`,
  `${SCOPE}icons/icon-512.png`,
  `${SCOPE}icons/icon-maskable-512.png`,
  `${SCOPE}icons/apple-touch-icon.png`,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // Best-effort: a single failed asset shouldn't block installation.
      await Promise.all(
        PRECACHE_URLS.map((url) => cache.add(url).catch(() => {}))
      );
    })()
  );
  // Deliberately NOT calling self.skipWaiting() here. A newly installed
  // worker sits in "waiting" until the client explicitly asks it to take
  // over (see the 'message' handler below) — so an update downloaded while
  // someone is mid-trace never swaps the app out from under them.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('skedio-') && !CURRENT_CACHES.has(name))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

// The client sends this only after the person has explicitly chosen to
// update (see lib/serviceWorker.ts) — never automatically.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isHashedBuildAsset(url) {
  // Vite build output for this project lives under {base}/assets/ with
  // content-hashed filenames (see vite.config.ts) — safe to cache forever.
  return url.pathname.startsWith(`${SCOPE}assets/`);
}

function isKnownStaticAsset(url) {
  return (
    url.pathname === `${SCOPE}manifest.webmanifest` ||
    url.pathname === `${SCOPE}favicon.ico` ||
    url.pathname === `${SCOPE}favicon-32.png` ||
    url.pathname.startsWith(`${SCOPE}icons/`)
  );
}

async function handleNavigationRequest(request) {
  try {
    const response = await fetch(request);
    // Keep a copy of the latest successfully-loaded shell so offline
    // reloads/relaunches have something real (not just the static fallback)
    // to show.
    const cache = await caches.open(SHELL_CACHE);
    cache.put(SCOPE, response.clone());
    return response;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const cachedShell = await cache.match(SCOPE);
    if (cachedShell) return cachedShell;
    const staticCache = await caches.open(STATIC_CACHE);
    const offline = await staticCache.match(OFFLINE_URL);
    return offline || Response.error();
  }
}

async function handleCacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

async function handleStaleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached || (await networkPromise) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // let cross-origin requests pass through untouched

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  if (isHashedBuildAsset(url)) {
    event.respondWith(handleCacheFirst(request, STATIC_CACHE));
    return;
  }

  if (isKnownStaticAsset(url)) {
    event.respondWith(handleStaleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  // Anything else (e.g. other same-origin GETs) — try the network, fall back
  // to cache if we happen to have a copy, otherwise let it fail normally.
  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      return cached || Response.error();
    })
  );
});
