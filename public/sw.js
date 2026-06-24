const APP_CACHE = 'facecapture-v2';
const MEDIAPIPE_CACHE = 'mediapipe-v1';

// MediaPipe domains to cache aggressively
const MEDIAPIPE_DOMAINS = ['cdn.jsdelivr.net', 'storage.googleapis.com'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== APP_CACHE && n !== MEDIAPIPE_CACHE).map(n => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // MediaPipe resources: cache-first, never re-download once cached
  if (MEDIAPIPE_DOMAINS.some(d => url.hostname.includes(d))) {
    event.respondWith(
      caches.open(MEDIAPIPE_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // App resources: stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(APP_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          const fetchPromise = fetch(event.request)
            .then(response => {
              if (response.ok) cache.put(event.request, response.clone());
              return response;
            })
            .catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
  }
});
