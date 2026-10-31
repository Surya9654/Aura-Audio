// Aura 3.0 Mobile Remote — Adaptive Network App-Shell Service Worker
// Ensures the Remote UI loads immediately even when opened from a previous Wi-Fi IP
// (e.g. saved Home Screen PWA or bookmark), allowing remote.js to auto-discover the new IP.

const CACHE_NAME = 'aura-remote-shell-v3.1';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/remote.css',
  '/remote.js',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never cache live API endpoints — let remote.js handle dynamic host routing
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) {
    return;
  }

  // Network-first with fast 1.2s timeout fallback to cached app shell
  event.respondWith(
    new Promise((resolve) => {
      let settled = false;
      const fallbackTimer = setTimeout(() => {
        if (settled) return;
        caches.match(req, { ignoreSearch: true }).then((cached) => {
          if (cached && !settled) {
            settled = true;
            resolve(cached);
          }
        });
      }, 1200);

      fetch(req)
        .then((res) => {
          clearTimeout(fallbackTimer);
          if (res && res.ok && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          if (!settled) {
            settled = true;
            resolve(res);
          }
        })
        .catch(() => {
          clearTimeout(fallbackTimer);
          if (settled) return;
          settled = true;
          caches.match(req, { ignoreSearch: true }).then((cached) => {
            resolve(cached || caches.match('/index.html'));
          });
        });
    })
  );
});

