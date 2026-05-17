const CACHE_NAME = "snooker-practice-log-v4-22-30-reflection-quick-resume";
const ASSETS = [
  "./index.html?v=4.22.30",
  "./styles.css?v=4.22.30",
  "./app.js?v=4.22.30",
  "./modules/app-core.js?v=4.22.30",
  "./modules/version.js?v=4.22.30",
  "./modules/store.js?v=4.22.30",
  "./modules/utils.js?v=4.22.30",
  "./modules/settings.js?v=4.22.30",
  "./modules/analytics.js?v=4.22.30",
  "./modules/bayesian.js?v=4.22.30",
  "./modules/session.js?v=4.22.30",
  "./modules/pressure.js?v=4.22.30",
  "./modules/recommendations.js?v=4.22.30",
  "./modules/render.js?v=4.22.30",
  "./manifest.json?v=4.22.30",
  "./icon.svg?v=4.22.30"
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
