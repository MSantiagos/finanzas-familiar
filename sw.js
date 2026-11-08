const CACHE_NAME = 'finanzas-familiar-v12';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './src/app.js',
  './src/domain/financialEngine.js',
  './src/data/defaults.js',
  './src/services/storage.js',
  './src/services/reconciler.js',
  './src/services/geminiScanner.js',
  './src/services/excelExport.js',
  './src/services/smartInput.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        ASSETS.map((asset) => cache.add(asset).catch(() => null))
      )
    )
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

  let url;
  try {
    url = new URL(event.request.url);
  } catch (e) {
    return;
  }

  // Crítico: jamás interceptar rutas de sincronización CRDT (/api/) ni llamadas externas a Google Sheets o Gemini API
  if (url.pathname.startsWith('/api/')) return;
  if (
    url.pathname.includes('/api/') ||
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('script.googleusercontent.com') ||
    url.hostname.includes('googleapis.com')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(async () => {
        const matched = await caches.match(event.request, { ignoreSearch: true });
        if (matched) return matched;
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html', { ignoreSearch: true });
        }
        return undefined;
      })
  );
});
