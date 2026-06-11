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
'/css/styles.css'
];

self.addEventListener('install', e => {
console.log('[SW] Instalando versão:', CACHE_VERSION);
e.waitUntil(
caches.open(CACHE_NAME).then(async cache => {
try {
await cache.addAll(ASSETS);
console.log('[SW] Assets cacheados com sucesso');
} catch (error) {
console.error('[SW] Erro ao cachear assets:', error);
}
})
);
self.skipWaiting(); // ✅ Força o SW a ativar imediatamente
});

self.addEventListener('activate', e => {
console.log('[SW] Ativando versão:', CACHE_VERSION);
e.waitUntil(
caches.keys().then(keys => {
return Promise.all(
keys.filter(key => key !== CACHE_NAME).map(async key => {
console.log('[SW] Deletando cache antigo:', key);
return caches.delete(key);
})
);
}).then(() => {
console.log('[SW] Caches antigos removidos');
return self.clients.claim(); // ✅ Toma controle imediatamente
})
);
});

self.addEventListener('fetch', e => {
const url = e.request.url;

// NUNCA cachear o próprio sw.js
if (url.includes('sw.js')) {
e.respondWith(fetch(e.request));
return;
}

// Cache para CDN externo
if (url.includes('cdn.weatherapi.com')) {
e.respondWith(
caches.match(e.request).then(cached => {
return cached || fetch(e.request).then(response => {
if (!response || response.status !== 200) return response;
const clone = response.clone();
caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
return response;
});
})
);
return;
}

// Nunca cachear chamadas de API
if (url.includes('/api/') || url.includes('weatherapi') || url.includes('nominatim')) {
e.respondWith(fetch(e.request));
return;
}

// Cache para assets locais
e.respondWith(
caches.match(e.request).then(cached => {
if (cached) return cached;

return fetch(e.request).then(response => {
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
