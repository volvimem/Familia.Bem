const CACHE_NAME = 'financas-premium-v8.8';
const urlsToCache = [
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon-512.png'
];

// Instala e força a substituição do cache antigo imediatamente
self.addEventListener('install', event => {
    self.skipWaiting(); 
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
});

// Limpa qualquer versão antiga do app que ficou presa no navegador
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('Limpando cache antigo:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Estratégia "Network First" - Garante que você sempre veja a versão mais recente se tiver internet
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});
