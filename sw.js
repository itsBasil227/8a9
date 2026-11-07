/* Qass service worker
 * 1. Offline: caches the app shell, hashed assets and the ffmpeg cores.
 * 2. Cross-origin isolation: adds COOP/COEP headers to same-origin responses so
 *    multi-threaded ffmpeg works even on static hosts that can't set headers.
 */
const CACHE = "qass-v2";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

function withIsolation(res) {
  if (!res || res.status === 0 || res.type === "opaque") return res;
  const headers = new Headers(res.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "credentialless");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.headers.has("range")) return;

  const isNav = req.mode === "navigate";
  const immutable = /\/assets\/|\/ffmpeg\//.test(url.pathname);

  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (immutable) {
        const hit = await cache.match(req);
        if (hit) return withIsolation(hit);
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return withIsolation(res);
      }
      // network-first for the page and small files
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(isNav ? new Request(url.origin + url.pathname) : req, res.clone());
        return withIsolation(res);
      } catch (err) {
        const hit = (await cache.match(req)) || (isNav && (await cache.match(new Request(url.origin + url.pathname))));
        if (hit) return withIsolation(hit);
        throw err;
      }
    })(),
  );
});
