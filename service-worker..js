const CACHE_NAME = "snooker-practice-log-v3-26-0";
const ASSETS = [
  "./index.html?v=3.26.0",
  "./styles.css?v=3.26.0",
  "./app.js?v=3.26.0",
  "./manifest.json?v=3.26.0",
  "./icon.svg?v=3.26.0"
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
  const req = event.request;
  const url = new URL(req.url);
  const isAppFile = ["index.html", "styles.css", "app.js", "manifest.json", "icon.svg"].some(name => url.pathname.endsWith(name));
  if (isAppFile) {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }
  event.respondWith(caches.match(req).then(cached => cached || fetch(req)));
});