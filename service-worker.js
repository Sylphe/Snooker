const CACHE_NAME = "snooker-practice-log-v4-12-0-final";
const ASSETS = [
  "./index.html?v=4.12.0",
  "./styles.css?v=4.12.0",
  "./app.js?v=4.12.0",
  "./modules/app-core.js?v=4.12.0",
  "./modules/version.js?v=4.12.0",
  "./modules/store.js?v=4.12.0",
  "./modules/utils.js?v=4.12.0",
  "./modules/settings.js?v=4.12.0",
  "./modules/analytics.js?v=4.12.0",
  "./modules/bayesian.js?v=4.12.0",
  "./modules/session.js?v=4.12.0",
  "./modules/recommendations.js?v=4.12.0",
  "./modules/render.js?v=4.12.0",
  "./manifest.json?v=4.12.0",
  "./icon.svg?v=4.12.0"
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
