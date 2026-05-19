const CACHE_NAME = "snooker-practice-log-v5-5-3-session-ui-hardening";
const ASSETS = [
  "./index.html?v=5.5.3",
  "./styles.css?v=5.5.3",
  "./app.js?v=5.5.3",
  "./modules/app-core.js?v=5.5.3",
  "./modules/version.js?v=5.5.3",
  "./modules/store.js?v=5.5.3",
  "./modules/utils.js?v=5.5.3",
  "./modules/settings.js?v=5.5.3",
  "./modules/analytics.js?v=5.5.3",
  "./modules/bayesian.js?v=5.5.3",
  "./modules/session.js?v=5.5.3",
  "./modules/pressure.js?v=5.5.3",
  "./modules/recommendations.js?v=5.5.3",
  "./modules/render.js?v=5.5.3",
  "./modules/inference.js?v=5.5.3",
  "./manifest.json?v=5.5.3",
  "./icon.svg?v=5.5.3"
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

function cacheResponse(request, response) {
  if (!response || response.status !== 200) return response;
  const copy = response.clone();
  caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
  return response;
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const isAppFile = url.pathname.endsWith(".js") || ["index.html", "styles.css", "manifest.json", "icon.svg"].some(name => url.pathname.endsWith(name));
  if (isAppFile) {
    event.respondWith(
      caches.match(request, {ignoreSearch:true}).then(cached => {
        const networkFetch = fetch(request)
          .then(response => cacheResponse(request, response))
          .catch(() => null);
        return cached || networkFetch;
      })
    );
    return;
  }
  event.respondWith(caches.match(request, { ignoreSearch: true }).then(cached => cached || fetch(request)));
});
