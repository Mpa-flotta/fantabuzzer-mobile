
const CACHE = "fantabuzzer-v1";
const ASSETS = ["/", "/index.html", "/style.css", "/app.js", "/manifest.json"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener("fetch", event => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
