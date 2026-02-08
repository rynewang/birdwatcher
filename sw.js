// Service Worker for Bird Watcher PWA

const CACHE_NAME = 'birdwatcher-v9';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/src/app.js',
  '/src/config.js',
  '/src/camera.js',
  '/src/motion-detector.js',
  '/src/bird-detector.js',
  '/src/recorder.js',
  '/src/storage.js',
  '/src/ui.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/favicon.ico',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  // Claim clients immediately
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip CDN requests (TensorFlow.js)
  if (event.request.url.includes('cdn.jsdelivr.net') ||
      event.request.url.includes('unpkg.com') ||
      event.request.url.includes('tfhub.dev')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((response) => {
        // Don't cache non-success responses
        if (!response || response.status !== 200) {
          return response;
        }

        // Clone response for caching
        const responseToCache = response.clone();

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      });
    })
  );
});
