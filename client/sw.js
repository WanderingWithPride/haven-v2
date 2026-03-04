const CACHE_NAME = 'cyberdeck-shell-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/app.js',
    '/js/music.js',
    '/js/photos.js',
    '/js/videos.js',
    '/js/llm.js',
    '/js/wiki.js',
    '/js/maps.js',
    '/js/ebooks.js',
    '/js/files.js'
    // Exclude API responses, media streams, and dynamically fetched content
];

// Install event: cache app shell
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting(); // Activate worker immediately
});

// Activate event: cleanup old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim(); // Take control of all pages immediately
});

// Fetch event: Network first for APIs, Cache first for shell
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Bypass cache completely for API calls
    if (url.pathname.startsWith('/api/') || event.request.method !== 'GET') {
        return event.respondWith(fetch(event.request));
    }

    // Cache-First strategy for static assets (app shell)
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse;
            }

            // If not in cache, fetch from network
            return fetch(event.request).then(networkResponse => {
                // Determine if we should cache the response (only cache static assets, not external media, etc)
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    // Clone because streams can only be consumed once
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(err => {
                console.error('Fetch failed (offline or network error):', err);
                // We could return an offline fallback page here if desired.
            });
        })
    );
});
