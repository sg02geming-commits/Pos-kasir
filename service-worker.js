// ============================================================
// KASEN SERVICE WORKER
// ============================================================
const CACHE_NAME = 'kasen-v1';
const RUNTIME_CACHE = 'kasen-runtime-v1';

// File yang di-cache saat install (app shell)
const PRECACHE_URLS = [
  './',
  './kasir.html',
  './manager.html',
  './manifest-kasir.json',
  './manifest-manager.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png'
];

// ============================================================
// INSTALL
// ============================================================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Pre-caching app shell');
      return cache.addAll(PRECACHE_URLS).catch(err => {
        console.warn('[SW] Precache partial fail:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ============================================================
// ACTIVATE
// ============================================================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== RUNTIME_CACHE)
            .map(k => {
              console.log('[SW] Deleting old cache:', k);
              return caches.delete(k);
            })
      );
    }).then(() => self.clients.claim())
  );
});

// ============================================================
// FETCH — Cache First untuk HTML, Network First untuk lainnya
// ============================================================
self.addEventListener('fetch', event => {
  const req = event.request;

  // Skip non-GET
  if (req.method !== 'GET') return;

  // Skip cross-origin (kecuali yang di-cache)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Skip Bluetooth & API calls
  if (url.pathname.includes('/api/')) return;

  // HTML: Network first, fallback cache (biar update bisa masuk)
  if (req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const clone = res.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./kasir.html')))
    );
    return;
  }

  // Asset lain (icon, json, css, js): Cache first
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(RUNTIME_CACHE).then(cache => cache.put(req, clone));
        return res;
      });
    }).catch(() => {
      // Offline fallback
      if (req.destination === 'image') {
        return caches.match('./icon-192.png');
      }
    })
  );
});

// ============================================================
// MESSAGE — update manual dari app
// ============================================================
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// ============================================================
// PUSH NOTIFICATION (opsional, untuk nanti)
// ============================================================
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Kasen', {
      body: data.body || '',
      icon: './icon-192.png',
      badge: './icon-192.png',
      vibrate: [200, 100, 200]
    })
  );
});