const CACHE_NAME = "sonic-learn-v1";

const APP_FILES = [
    "./",
    "./index.html",
    "./lessons.html",
    "./quiz.html",
    "./css/styles.css",
    "./js/app.js",
    "./js/lessons.js",
    "./js/quiz.js",
    "./lessons.json",
    "./manifest.json"
];

//Install: cache available core files individually.
//A missing optional page won't prevent the worker from installing.
self.addEventListener("install", (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);

            await Promise.all(
                APP_FILES.map(async (url) => {
                    try {
                        const response = await fetch(url), {cache};

                        if(response.ok && response.type === "basic") {
                            await cache.put(url, response);
                        } else {
                            console.warn("Not cached:", url, response.status, response.type);
                        }
                    } catch (error) {
                        console.warn("Could not cache:", url, error);
                    }
                })
            );
            await self.skipWaiting();
        })
    );
});

//Activate: remove old Sonic Learn caches.
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

//Fetch: prefer the network, then fall back to cached files.
self.addEventListener("fetch", (event) => {
    const request = event.request;
    const url = new URL(request.url);

// Handle only same-origin GET requests.
if(
    requset.method !== "GET" ||
    url.origin !== self.location.origin
) {
    return;
}

//Do not cache browser/API data or non-page requests.
if(
    url.pathname.includes("/api/") ||
    url.pathname.endsWith(".php")
) {
    return;
}

event.respondWith(
    (async () => {
        try {
            const response = await fetch(request);

            //Cache successful same-origin static resources.
            if(
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

            if (cached) {
                return cached;
            }   

        //  Offline navigation fallback.
        if (request.mode === "navigate"){
            const cachedHome = await caches.match("./index.html");

            if (cachedHome){
                return cachedHome
            }
        }

        return new Response("You are offline. Please reconnect and try again.",
            {
                status: 503,
                headers: {"Content-Type": "text/plain; charset=utf-8"}
            });
        }
    })()
);
});
