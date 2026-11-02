const CACHE_NAME = 'finanzas-familiar-v8';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './src/app.js',
  './src/data/defaults.js',
  './src/services/storage.js',
  './src/services/reconciler.js',
  './src/services/geminiScanner.js',
  './src/services/excelExport.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-First: siempre intenta traer la versión más reciente y usa caché solo si no hay conexión
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
