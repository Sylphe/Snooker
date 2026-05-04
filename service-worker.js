const CACHE_NAME = "snooker-practice-log-v3-25-9-final";
const ASSETS = [
  "./index.html?v=3.25.9",
  "./styles.css?v=3.25.9",
  "./app.js?v=3.25.9",
  "./manifest.json?v=3.25.9",
  "./icon.svg?v=3.25.9"
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
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const isAppFile = ["index.html", "app.js", "styles.css", "manifest.json", "icon.svg"].some(name => url.pathname.endsWith(name));
  if (isAppFile) {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      return response;
    }).catch(() => caches.match(request)));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
});
