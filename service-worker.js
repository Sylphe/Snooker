const CACHE_NAME = "snooker-practice-log-v4-8-1-final";
const ASSETS = [
  "./index.html?v=4.8.1",
  "./styles.css?v=4.8.1",
  "./app.js?v=4.8.1",
  "./modules/app-core.js?v=4.8.1",
  "./modules/version.js?v=4.8.1",
  "./modules/store.js?v=4.8.1",
  "./modules/utils.js?v=4.8.1",
  "./modules/settings.js?v=4.8.1",
  "./modules/analytics.js?v=4.8.1",
  "./modules/session.js?v=4.8.1",
  "./modules/recommendations.js?v=4.8.1",
  "./modules/render.js?v=4.8.1",
  "./manifest.json?v=4.8.1",
  "./icon.svg?v=4.8.1"
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
  const isAppFile = ["index.html", "app.js", "app-core.js", "version.js", "styles.css", "manifest.json", "icon.svg"].some(name => url.pathname.endsWith(name));
  if (isAppFile) {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      return response;
    }).catch(() => caches.match(request, { ignoreSearch: true })));
    return;
  }
  event.respondWith(caches.match(request, { ignoreSearch: true }).then(cached => cached || fetch(request)));
});
