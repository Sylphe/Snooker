const CACHE_VERSION = "5.7.64-benchmark-roadmap";
const CACHE_NAME = `snooker-practice-log-${CACHE_VERSION}`;
const ASSETS = [
  "./index.html?v=5.7.64",
  "./styles.css?v=5.7.64",
  "./app.js?v=5.7.64",
  "./early-theme.js?v=5.7.64",
  "./modules/app-core.js?v=5.7.64",
  "./modules/version.js?v=5.7.64",
  "./modules/store.js?v=5.7.64",
  "./modules/utils.js?v=5.7.64",
  "./modules/settings.js?v=5.7.64",
  "./modules/analytics.js?v=5.7.64",
  "./modules/bayesian.js?v=5.7.64",
  "./modules/session.js?v=5.7.64",
  "./modules/pressure.js?v=5.7.64",
  "./modules/recommendations.js?v=5.7.64",
  "./modules/render.js?v=5.7.64",
  "./modules/inference.js?v=5.7.64",
  "./manifest.json?v=5.7.64",
  "./routine-packs/curated-snooker-routine-pack-v1.json?v=5.7.64",
  "./routine-packs/nolan-benchmark-pack-v1.json?v=5.7.64",
  "./icon.svg?v=5.7.64"
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

function normalizedPathname(url) {
  return String(url?.pathname || "").toLowerCase();
}

function isCacheableAppFile(url) {
  const path = normalizedPathname(url);
  return path.endsWith(".js") || ["index.html", "styles.css", "manifest.json", "icon.svg"].some(name => path.endsWith(name));
}

function expectedContentType(url) {
  const path = normalizedPathname(url);
  if (path.endsWith(".js")) return "javascript";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith("manifest.json")) return "application/manifest+json|application/json";
  if (path.endsWith("icon.svg")) return "image/svg+xml";
  return "text/html";
}

function responseHasExpectedType(url, response) {
  const expected = expectedContentType(url);
  const contentType = (response.headers.get("Content-Type") || "").toLowerCase();
  return expected.split("|").some(part => contentType.includes(part.toLowerCase()));
}


function offlineFallbackResponse(url) {
  if (normalizedPathname(url).endsWith(".js")) {
    return new Response('console.warn("Snooker Practice offline: uncached script unavailable.");', {status:503, headers:{"Content-Type":"application/javascript","Cache-Control":"no-store"}});
  }
  if (normalizedPathname(url).endsWith(".css")) {
    return new Response("", {status:503, headers:{"Content-Type":"text/css","Cache-Control":"no-store"}});
  }
  if (normalizedPathname(url).endsWith("manifest.json")) {
    return new Response("{}", {status:503, headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
  }
  if (normalizedPathname(url).endsWith("icon.svg")) {
    return new Response("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1 1\"></svg>", {status:503, headers:{"Content-Type":"image/svg+xml","Cache-Control":"no-store"}});
  }
  return new Response("<!doctype html><title>Offline</title><main><h1>Snooker Practice is offline</h1><p>The requested app file is not cached yet. Reconnect once, then reopen the app.</p></main>", {status:503, headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}});
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
          .catch(() => offlineFallbackResponse(url));
        return cached || networkFetch || offlineFallbackResponse(url);
      })
    );
    return;
  }
  event.respondWith(caches.match(request, { ignoreSearch: true }).then(cached => cached || fetch(request).catch(() => new Response("Offline", {status:503, headers:{"Content-Type":"text/plain","Cache-Control":"no-store"}}))));
});
