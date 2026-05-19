const CACHE_NAME = "snooker-practice-log-v5-4-4-advanced-analytics-language-pass";
const ASSETS = [
  "./index.html?v=5.4.4",
  "./styles.css?v=5.4.4",
  "./app.js?v=5.4.4",
  "./modules/app-core.js?v=5.4.4",
  "./modules/version.js?v=5.4.4",
  "./modules/store.js?v=5.4.4",
  "./modules/utils.js?v=5.4.4",
  "./modules/settings.js?v=5.4.4",
  "./modules/analytics.js?v=5.4.4",
  "./modules/bayesian.js?v=5.4.4",
  "./modules/session.js?v=5.4.4",
  "./modules/pressure.js?v=5.4.4",
  "./modules/recommendations.js?v=5.4.4",
  "./modules/render.js?v=5.4.4",
  "./modules/inference.js?v=5.4.4",
  "./manifest.json?v=5.4.4",
  "./icon.svg?v=5.4.4"
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
  const isAppFile = url.pathname.endsWith(".js") || ["index.html", "styles.css", "manifest.json", "icon.svg"].some(name => url.pathname.endsWith(name));
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



