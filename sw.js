const CACHE_VERSION = '19.05.2026-1621';
const CACHE_NAME = `cozinha-baron-${CACHE_VERSION}`;
const ASSETS = [
'/meuclima/',
'/meuclima/index.html',
'/meuclima/manifest.json',
'/meuclima/icon-192.png',
'/meuclima/icon-512.png',
'/meuclima/img/splash.png',
'/meuclima/img/meuclima.png',
'/meuclima/img/yr.png',
'/meuclima/receitas.json',
'/meuclima/components/script.js',
'/meuclima/css/styles.css'
];

self.addEventListener('install', e => {
e.waitUntil(
caches.open(CACHE_NAME).then(cache => {
return cache.addAll(ASSETS);
})
);
self.skipWaiting();
});

self.addEventListener('activate', e => {
e.waitUntil(
caches.keys().then(keys => {
return Promise.all(
keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
);
})
);
self.clients.claim();
});

self.addEventListener('fetch', e => {
const url = e.request.url;

// Só intercepta requisições do mesmo domínio
if (!url.startsWith(self.location.origin)) {
return;
}

// Evita cache de chamadas de API
if (url.includes('/api/') || url.includes('weatherapi') || url.includes('nominatim')) {
e.respondWith(fetch(e.request));
return;
}

e.respondWith(
caches.match(e.request).then(cached => {
if (cached) {
return cached;
}

return fetch(e.request).then(response => {
// Não cacheia respostas que não são OK
if (!response || response.status !== 200 || response.type !== 'basic') {
return response;
}

const responseToCache = response.clone();
caches.open(CACHE_NAME).then(cache => {
cache.put(e.request, responseToCache);
});

return response;
});
})
);
});
