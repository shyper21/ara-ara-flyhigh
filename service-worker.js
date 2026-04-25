// ==========================================================
// SERVICE WORKER - Market Terminal PWA
// Caching strategy: network-first untuk API, cache-first untuk assets
// ==========================================================

const CACHE_VERSION = 'market-terminal-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Files yang di-cache saat install (bisa diakses offline)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/saham.html',
  '/manifest.json',
];

// External CDN yang aman di-cache
const CACHEABLE_CDN_DOMAINS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  's3.tradingview.com',
];

// ==========================================================
// INSTALL — Cache static assets
// ==========================================================
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Failed to cache some assets:', err);
      });
    })
  );
  self.skipWaiting();
});

// ==========================================================
// ACTIVATE — Cleanup old caches
// ==========================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !name.startsWith(CACHE_VERSION))
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// ==========================================================
// FETCH — Routing strategy
// ==========================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // 1. API requests — network-first (always try fresh data)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 2. Same-origin static files — cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 3. External CDN (fonts, TradingView) — stale-while-revalidate
  if (CACHEABLE_CDN_DOMAINS.some(domain => url.hostname.includes(domain))) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // 4. Other requests — pass through
});

// ==========================================================
// CACHING STRATEGIES
// ==========================================================

// Network-first: try network, fallback to cache (untuk API)
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    return new Response(
      JSON.stringify({ error: 'Offline', message: 'No internet & no cache' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Cache-first: try cache, fallback to network (untuk static)
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Offline & no cache
    return new Response('Offline', { status: 503 });
  }
}

// Stale-while-revalidate: serve cache immediately, update in background
async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => cached);

  return cached || fetchPromise;
}

// ==========================================================
// MESSAGE HANDLER (untuk komunikasi dengan halaman)
// ==========================================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
  }
});
