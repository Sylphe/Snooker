const CACHE_VERSION = "5.5.15-performance-pass";
const CACHE_NAME = `snooker-practice-log-${CACHE_VERSION}`;
const ASSETS = [
  "./index.html?v=5.5.15",
  "./styles.css?v=5.5.15",
  "./app.js?v=5.5.15",
  "./modules/app-core.js?v=5.5.15",
  "./modules/version.js?v=5.5.15",
  "./modules/store.js?v=5.5.15",
  "./modules/utils.js?v=5.5.15",
  "./modules/settings.js?v=5.5.15",
  "./modules/analytics.js?v=5.5.15",
  "./modules/bayesian.js?v=5.5.15",
  "./modules/session.js?v=5.5.15",
  "./modules/pressure.js?v=5.5.15",
  "./modules/recommendations.js?v=5.5.15",
  "./modules/render.js?v=5.5.15",
  "./modules/inference.js?v=5.5.15",
  "./manifest.json?v=5.5.15",
  "./icon.svg?v=5.5.15"
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

function isLocalDevelopmentUrl(url) {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "0.0.0.0";
}

function isSafeAppRequest(request, url) {
  if (request.method !== "GET") return false;
  if (url.origin !== self.location.origin) return false;
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalDevelopmentUrl(url))) return false;
  return true;
}

function isCacheableAppFile(url) {
  return url.pathname.endsWith(".js") || ["index.html", "styles.css", "manifest.json", "icon.svg"].some(name => url.pathname.endsWith(name));
}

function expectedContentType(url) {
  if (url.pathname.endsWith(".js")) return "javascript";
  if (url.pathname.endsWith(".css")) return "text/css";
  if (url.pathname.endsWith("manifest.json")) return "application/manifest+json|application/json";
  if (url.pathname.endsWith("icon.svg")) return "image/svg+xml";
  return "text/html";
}

function responseHasExpectedType(url, response) {
  const expected = expectedContentType(url);
  const contentType = (response.headers.get("Content-Type") || "").toLowerCase();
  return expected.split("|").some(part => contentType.includes(part.toLowerCase()));
}

function cacheResponse(request, response) {
  const url = new URL(request.url);
  if (!response || response.status !== 200 || response.type === "error") return response;
  if (!isSafeAppRequest(request, url) || !responseHasExpectedType(url, response)) return response;
  const copy = response.clone();
  caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
  return response;
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!isSafeAppRequest(request, url)) return;
  if (url.pathname.endsWith("/sw-version.json") || url.pathname.endsWith("sw-version.json")) {
    event.respondWith(new Response(JSON.stringify({version:CACHE_VERSION, cache:CACHE_NAME}), {headers:{"Content-Type":"application/json","Cache-Control":"no-store"}}));
    return;
  }
  const isAppFile = isCacheableAppFile(url);
  if (isAppFile) {
    event.respondWith(
      caches.match(request, {ignoreSearch:true}).then(cached => {
        const networkFetch = fetch(request, {cache:"no-store"})
          .then(response => cacheResponse(request, response))
          .catch(() => null);
        return cached || networkFetch;
      })
    );
    return;
  }
  event.respondWith(caches.match(request, { ignoreSearch: true }).then(cached => cached || fetch(request)));
});
