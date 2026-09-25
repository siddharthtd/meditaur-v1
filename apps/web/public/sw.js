/**
 * The app shell, cached so an installed Meditaur opens without a network.
 *
 * Two strategies, and the split is the whole design:
 *
 * - **Navigations are network-first.** The obvious shape — cache-first for every
 *   same-origin GET — is the one that breaks a deploy. An installed app serves
 *   the shell it cached weeks ago, that shell asks for chunk URLs the deploy has
 *   since deleted, and the app is dead until somebody clears the cache by hand.
 *   A document therefore tries the network and only falls back to the cache,
 *   which is what "offline" has to mean when the alternative is a stale app.
 * - **Build output is cache-first**, because `/_next/static/**` is
 *   content-hashed: a hit is always the right bytes by construction.
 *
 * Nothing that authenticates is ever cached, on any method or origin. A stale
 * auth response is worse than a failed one — it looks like being signed in.
 */
const VERSION = "meditaur-shell-v6";

/**
 * The documents an installed icon can open. Precached so the very first offline
 * launch works, not just the second visit.
 *
 * Hand-written, and that is the one thing about this file that can rot quietly:
 * a route added to the app and not here is a route that does not open offline.
 * `tests/unit/web/service-worker.test.ts` now reads this list and the app's own
 * routes and fails on a route that is neither cached nor named as deliberately
 * uncached, so adding a screen forces the decision instead of defaulting to
 * "forgotten".
 */
// `/database` joined the list on 2026-09-19, when the Database left the library's
// tab strip and became a destination an installed icon can open like any other.
// `/admin` joined on 2026-09-23: the owner's panel is a destination too, and it opens
// nothing private — a non-admin gets a sentence (`P0 · 23`).
// `/record` joined on 2026-09-24, when a record got an address of its own: the page
// reads `kind`, `id` and `from` from the query string, so its *path* is what belongs
// here and a cached document without them is the screen's own "that record is gone".
const SHELL = [
  "/",
  "/plan",
  "/library",
  "/database",
  "/record",
  "/settings",
  "/account",
  "/privacy",
  "/tuner",
  "/admin"
];

/**
 * The build output a shell document refers to, found by reading it.
 *
 * Without this the worker caches a document that cannot start: the HTML comes
 * back offline and every `/_next/static/**` chunk behind it is a miss, so the
 * page never hydrates. That was the first version of this file, and it looked
 * fine until an offline reload was actually tried. Next content-hashes these
 * URLs, so a parsed list cannot go stale within a cache version.
 */
function assetUrls(html) {
  const found = new Set();
  for (const match of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]*)"/g)) {
    found.add(match[1]);
  }
  return [...found];
}

/** Paths that must always reach the network, whoever serves them. */
function isPrivate(pathname) {
  return (
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/rest/") ||
    pathname.startsWith("/storage/")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then(async (cache) => {
      const assets = new Set();
      for (const path of SHELL) {
        try {
          const response = await fetch(path, { cache: "no-cache" });
          if (!response.ok) continue;
          await cache.put(path, response.clone());
          for (const url of assetUrls(await response.text())) assets.add(url);
        } catch {
          // One route failing at deploy time is not a reason to leave the reader
          // with no worker at all.
        }
      }
      await Promise.all([...assets].map((url) => cache.add(url).catch(() => undefined)));
    }),
  );
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => pruneSupersededAssets())
      .then(() => self.clients.claim()),
  );
});

/**
 * Build output this cache no longer has any use for.
 *
 * A deploy renames every chunk: the old URLs are referenced by the old
 * documents and by nothing else. `activate` alone cannot clean them up, because
 * it fires when *this file* changes, and the app is deployed far more often than
 * the worker is. So the clean-up also runs after a navigation has stored a fresh
 * document — the moment a cache is known to hold a document from a new deploy.
 *
 * What is kept is exactly what some cached document still names, found by
 * reading it through `assetUrls`. Anything under `/_next/static/` that no
 * document refers to is unreachable: a cached document is the only thing that
 * can ask for it, and offline it is the only way one would.
 */
async function pruneSupersededAssets() {
  const cache = await caches.open(VERSION);
  const requests = await cache.keys();
  const referenced = new Set();
  for (const request of requests) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/_next/static/")) continue;
    const response = await cache.match(request);
    if (!response) continue;
    for (const asset of assetUrls(await response.text())) referenced.add(asset);
  }
  const superseded = requests.filter((request) => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/_next/static/")) return false;
    return !referenced.has(url.pathname + url.search);
  });
  await Promise.all(superseded.map((request) => cache.delete(request)));
  return superseded.length;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Off-origin means Supabase or something like it. Straight to the network.
  if (url.origin !== self.location.origin) return;
  if (isPrivate(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches
              .open(VERSION)
              .then((cache) => cache.put(request, copy))
              // The moment a document from a new deploy is in hand. Nothing else
              // in this file would ever drop the chunks that document replaced.
              .then(() => pruneSupersededAssets());
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          // A route the reader never opened still gets a shell that starts.
          const fallback = await caches.match("/plan");
          if (fallback) return fallback;
          return Response.error();
        }),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
  }
});
