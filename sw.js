/* =========================================================
   SONIC LEARN — Service Worker
   File: sw.js
   Scope: root (must stay at repo root)

   Strategy:
     - Pre-cache core app shell on install
     - Network-first for same-origin GET requests
     - Fall back to cache when offline
     - Fall back to index.html for offline navigation
     - Delete old sonic-learn-* caches on activate
   ========================================================= */

const CACHE_NAME = "sonic-learn-v1";

const APP_FILES = [
    "./",
    "./index.html",
    "./lessons.html",
    "./quiz.html",
    "./css/style.css",
    "./css/game.css",       
    "./js/app.js",
    "./js/progress.js",
    "./js/lessons.js",
    "./js/quiz.js",
    "./js/game.js",         
    "./lessons.json",
    "./manifest.json"
];

/* ---------- Install: cache core files individually ---------- */
self.addEventListener("install", (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);

            await Promise.all(
                APP_FILES.map(async (url) => {
                    try {
                        const response = await fetch(url, { cache: "no-cache" });

                        if (response.ok && response.type === "basic") {
                            await cache.put(url, response);
                        } else {
                            console.warn("[SW] Not cached:", url, response.status, response.type);
                        }
                    } catch (error) {
                        console.warn("[SW] Could not cache:", url, error);
                    }
                })
            );

            await self.skipWaiting();
        })()
    );
});

/* ---------- Activate: remove old Sonic Learn caches ---------- */
self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();

            await Promise.all(
                keys
                    .filter(
                        (key) =>
                            key.startsWith("sonic-learn-") &&
                            key !== CACHE_NAME
                    )
                    .map((key) => caches.delete(key))
            );

            await self.clients.claim();
        })()
    );
});

/* ---------- Fetch: network-first, cache fallback ---------- */
self.addEventListener("fetch", (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Handle only same-origin GET requests.
    if (
        request.method !== "GET" ||
        url.origin !== self.location.origin
    ) {
        return;
    }

    // Skip API and dynamic endpoints.
    if (
        url.pathname.includes("/api/") ||
        url.pathname.endsWith(".php")
    ) {
        return;
    }

    event.respondWith(
        (async () => {
            try {
                const response = await fetch(request);

                // Cache successful same-origin static resources.
                if (
                    response.ok &&
                    response.type === "basic" &&
                    !request.headers.has("range")
                ) {
                    const cache = await caches.open(CACHE_NAME);
                    await cache.put(request, response.clone());
                }

                return response;
            } catch (error) {
                const cached = await caches.match(request);
                if (cached) return cached;

                // Offline navigation fallback.
                if (request.mode === "navigate") {
                    const cachedHome = await caches.match("./index.html");
                    if (cachedHome) return cachedHome;
                }

                return new Response(
                    "You are offline. Please reconnect and try again.",
                    {
                        status: 503,
                        headers: { "Content-Type": "text/plain; charset=utf-8" }
                    }
                );
            }
        })()
    );
});