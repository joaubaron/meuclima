const CACHE_VERSION = '22.04.2026-1458';
const CACHE_NAME = `cozinha-baron-${CACHE_VERSION}`;
const ASSETS = [
  '/cozinhabaron/',
  '/cozinhabaron/index.html',
  '/cozinhabaron/manifest.json',
  '/cozinhabaron/icon-192.png',
  '/cozinhabaron/icon-512.png',
  '/cozinhabaron/logo.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
