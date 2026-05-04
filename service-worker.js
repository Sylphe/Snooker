const CACHE_NAME = "snooker-practice-log-v3-25-5-final";
const ASSETS = [
  "./index.html?v=3.25.5",
  "./styles.css?v=3.25.5",
  "./app.js?v=3.25.5",
  "./manifest.json?v=3.25.5",
  "./icon.svg?v=3.25.5"
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
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  const isAppShell = requestUrl.pathname.endsWith("/index.html") || requestUrl.pathname.endsWith("/") || /\.(js|css|json|svg)$/.test(requestUrl.pathname);
  if (isAppShell) {
    event.respondWith(
      fetch(event.request, {cache: "no-store"})
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match("./index.html?v=3.25.5")))
    );
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
