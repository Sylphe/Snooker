const CACHE_VERSION = "5.5.7-runtime-performance-hardening";
const CACHE_NAME = `snooker-practice-log-${CACHE_VERSION}`;
const ASSETS = [
  "./index.html?v=5.5.7",
  "./styles.css?v=5.5.7",
  "./app.js?v=5.5.7",
  "./modules/app-core.js?v=5.5.7",
  "./modules/version.js?v=5.5.7",
  "./modules/store.js?v=5.5.7",
  "./modules/utils.js?v=5.5.7",
  "./modules/settings.js?v=5.5.7",
  "./modules/analytics.js?v=5.5.7",
  "./modules/bayesian.js?v=5.5.7",
  "./modules/session.js?v=5.5.7",
  "./modules/pressure.js?v=5.5.7",
  "./modules/recommendations.js?v=5.5.7",
  "./modules/render.js?v=5.5.7",
  "./modules/inference.js?v=5.5.7",
  "./manifest.json?v=5.5.7",
  "./icon.svg?v=5.5.7"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(ASSETS.map(asset =>
        cache.add(asset).catch(error => {
          console.warn("Service worker cache skipped asset", asset, error);
          return null;
        })
      ))
    )
  );
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
  if (url.pathname.endsWith("/sw-version.json") || url.pathname.endsWith("sw-version.json")) {
    event.respondWith(new Response(JSON.stringify({version:CACHE_VERSION, cache:CACHE_NAME}), {headers:{"Content-Type":"application/json","Cache-Control":"no-store"}}));
    return;
  }
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
