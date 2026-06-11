const CACHE_VERSION = '11.06.2026-1200';
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
'/css/styles.css',
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
// 🔥 NOVO: Cache para ícones do clima (CDN externo)
if (url.includes('cdn.weatherapi.com')) {
e.respondWith(
caches.match(e.request).then(cached => {
return cached || fetch(e.request).then(response => {
if (!response || response.status !== 200) {
return response;
}
const clone = response.clone();
caches.open(CACHE_NAME).then(cache => {
cache.put(e.request, clone);
});
return response;
});
})
);
return;
}
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
