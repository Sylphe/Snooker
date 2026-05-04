const CACHE_NAME = "snooker-practice-log-v3-25-8-final";
const ASSETS = [
  "./index.html?v=3.25.8",
  "./styles.css?v=3.25.8",
  "./app.js?v=3.25.8",
  "./manifest.json?v=3.25.8",
  "./icon.svg?v=3.25.8"
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
  if (event.request.mode === "navigate" || /(?:index\.html|app\.js|styles\.css|manifest\.json)/.test(event.request.url)) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
