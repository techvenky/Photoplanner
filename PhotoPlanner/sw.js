// ─── PhotoPlanner Service Worker ─────────────────────────────────────────────
// Cache-first for app shell, network-first for map tiles.

const CACHE_NAME = 'photoplanner-ac5d3ecc';

// App shell: everything needed to run offline
const APP_SHELL = [
  './index.html',
  './manifest.json',
  './dist/bundle.min.js',
  './dist/style.min.css',
];

// CDN libraries — cache on first fetch, serve from cache thereafter
const CDN_HOSTS = [
  'cdn.jsdelivr.net',
  'unpkg.com',
];

// Map tile hosts — always try network, never cache (too many tiles)
const TILE_HOSTS = [
  'tile.openstreetmap.org',
  'arcgisonline.com',
  'opentopomap.org',
  'basemaps.cartocdn.com',
];

// ─── Install: pre-cache app shell ────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ─── Activate: clean up old caches ───────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ─── Fetch: routing strategy ──────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Map tiles — network only (skip service worker entirely)
  if (TILE_HOSTS.some(h => url.hostname.includes(h))) {
    return; // fall through to network
  }

  // CDN libraries — cache-first, update in background
  if (CDN_HOSTS.some(h => url.hostname.includes(h))) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // App shell & local files — cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Anything else (e.g. geocoding API) — network-first
  event.respondWith(networkFirst(event.request));
});

// ─── Strategy helpers ─────────────────────────────────────────────────────────
async function cacheFirst(request) {
  // ignoreSearch: versioned URLs (?v=abc123) still match unversioned cache entries
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline — resource not cached.', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}
