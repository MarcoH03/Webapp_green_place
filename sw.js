// Service worker: guarda la app en el teléfono para usarla sin conexión.
// Cambia VERSION en cada publicación para que los teléfonos descarguen la nueva versión.
const PREFIX = 'green-place-';
const VERSION = PREFIX + 'v1.0.0';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/core.js',
  'js/store.js',
  'js/ui.js',
  'js/icons.js',
  'js/products.js',
  'js/sales.js',
  'js/money.js',
  'js/settings.js',
  'js/closure.js',
  'fonts/roboto-latin-400-normal.woff2',
  'fonts/roboto-latin-500-normal.woff2',
  'fonts/roboto-latin-700-normal.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)));
});

// Solo borra cachés antiguas de esta app (otras apps de marcoh03.github.io comparten el mismo origen).
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then((cache) =>
      cache.match(req, { ignoreSearch: true }).then((hit) => {
        if (hit) return hit;
        return fetch(req)
          .then((res) => {
            if (res.ok && !req.url.endsWith('.pdf') && !req.url.includes('/preview/')) cache.put(req, res.clone());
            return res;
          })
          .catch(() => (req.mode === 'navigate' ? cache.match('index.html') : Response.error()));
      }),
    ),
  );
});
