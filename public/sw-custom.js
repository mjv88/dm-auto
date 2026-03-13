// sw-custom.js — Custom service worker additions for Runner Hub
// This file is imported by next-pwa via importScripts or merged into the generated sw.js.
// It handles: offline fallback, new-version notification, API response caching.

const OFFLINE_URL = '/offline';
const API_CACHE_NAME = 'api-cache';
const API_BASE_PATTERNS = [/\/api\//];

// ── Install: pre-cache offline page ──────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('offline-fallback').then((cache) => cache.add(OFFLINE_URL))
  );
});

// ── Activate: claim clients so updates take effect immediately ────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ── Fetch: serve offline page when network fails for navigation requests ──────
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(OFFLINE_URL).then((cached) => cached || Response.error())
      )
    );
    return;
  }

  // Cache API base URL responses (NetworkFirst with offline fallback)
  const isApiRequest = API_BASE_PATTERNS.some((pattern) =>
    pattern.test(event.request.url)
  );
  if (isApiRequest) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(API_CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});

// ── Message: skip waiting on demand (sent by next-pwa or app code) ────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── New version available: notify all open tabs ───────────────────────────────
self.addEventListener('controllerchange', () => {
  self.clients.matchAll({ type: 'window' }).then((clients) => {
    clients.forEach((client) =>
      client.postMessage({ type: 'NEW_VERSION_AVAILABLE' })
    );
  });
});
