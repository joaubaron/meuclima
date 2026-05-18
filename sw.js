const CACHE_VERSION = '18.05.2026-1000';
const CACHE_NAME = `cozinha-baron-${CACHE_VERSION}`;
const ASSETS = [
  '/meuclima/',
  '/meuclima/index.html',
  '/meuclima/manifest.json',
  '/meuclima/icon-192.png',
  '/meuclima/icon-512.png',
  '/meuclima/img/splash.png'
  '/meuclima/img/meuclima.png'
  '/meuclima/img/yr.png'
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
