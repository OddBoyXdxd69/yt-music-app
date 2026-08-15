self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass through fetch for streaming and dynamic API
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
