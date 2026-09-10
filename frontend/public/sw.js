/* Siva Murugan Chit Fund — service worker.
 * - Pre-caches the app shell so it opens instantly / offline.
 * - Static assets (JS/CSS/fonts/icons): cache-first, then network.
 * - Navigations: network-first, fall back to the cached shell, then offline page.
 * - API calls (anything with "/backend/"): always network, never cached.
 */
const VERSION = 'smcf-v1';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;

const SHELL_URLS = ['./', './index.html', './manifest.webmanifest', './offline.html', './icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(SHELL_URLS)).catch(() => {}).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never touch the API — let it hit the network directly.
  if (url.pathname.includes('/backend/') || url.pathname.endsWith('/api') || url.pathname.includes('/api/')) {
    return;
  }

  // App navigations → network first, fall back to cached shell / offline page.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(SHELL).then((c) => c.put('./index.html', res.clone())).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./offline.html')))
    );
    return;
  }

  // Same-origin static assets → cache first, then network (and cache it).
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((hit) =>
        hit ||
        fetch(req).then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(ASSETS).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        }).catch(() => hit)
      )
    );
    return;
  }

  // Cross-origin (Google Fonts) → stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        const copy = res.clone();
        if (res.ok) caches.open(ASSETS).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
