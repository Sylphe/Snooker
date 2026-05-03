const CACHE_NAME = "snooker-practice-log-v3-21-final";
const ASSETS = [
  "./index.html?v=3.21",
  "./styles.css?v=3.21",
  "./app.js?v=3.21",
  "./manifest.json?v=3.21",
  "./icon.svg?v=3.21"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
