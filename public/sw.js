/* Hermes Agent Area — runtime cache SW (Vite hashed assets OK) */
const CACHE = "hermes-agent-area-v1";
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png",
  "./favicon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

function isNavigate(request) {
  return request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html");
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const fallback = await cache.match("./index.html");
    return (
      fallback ||
      new Response("오프라인", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })
    );
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (!sameOrigin(url)) return;

  // never cache API / WS upgrade leftovers
  if (url.pathname.includes("/api") || url.pathname.includes("/ws")) return;

  if (isNavigate(request) || /\.(html?)$/i.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // hashed js/css + static assets
  if (/\.(js|css|png|svg|json|wav|woff2?|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
