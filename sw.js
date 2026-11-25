// Offline cache for the planner: serve from the network when online,
// fall back to the cached copy when offline.
const CACHE = "planner-p3-v2";
const FILES = ["./", "index.html", "css/app.css", "js/data.js", "js/store.js", "js/vendor/supabase-2.118.0.js", "js/config.js", "js/sync.js", "js/setup.js", "js/workflow.js", "js/app.js", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  // GitHub Pages lets browsers reuse files for 10 minutes. "no-cache" makes
  // the browser check for a newer copy every time, so an update shows on the
  // next reload instead of up to 10 minutes later.
  const fresh = e.request.mode === "navigate" ? new Request(e.request.url, { cache: "no-cache", credentials: "same-origin" }) : new Request(e.request, { cache: "no-cache" });
  e.respondWith(
    fetch(fresh)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
