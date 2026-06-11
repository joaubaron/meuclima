const CACHE_VERSION = '11.06.2026-1245';
const CACHE_NAME = `meuclima-${CACHE_VERSION}`;
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/img/splash.png',
  '/img/meuclima.png',
  '/img/yr.png',
  '/receitas.json',
  '/components/script.js',
  '/css/styles.css'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== CACHE_NAME)
        .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // NUNCA cachear o próprio sw.js
  if (url.includes('sw.js')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Ignorar requisições externas
  if (!url.startsWith(self.location.origin)) return;

  // Nunca cachear APIs
  if (url.includes('/api/') || url.includes('weatherapi') || url.includes('nominatim') || url.includes('open-meteo')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Cache para assets locais
  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request);
    })
  );
});
