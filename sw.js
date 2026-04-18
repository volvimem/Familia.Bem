const CACHE_NAME = 'financas-premium-v7.2';
const urlsToCache = [
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon-512.png'
];

// Instalando o Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Arquivos em cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Interceptando requisições (Carrega offline se não tiver internet)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});
