import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

/**
 * The service worker, checked where Playwright cannot reach.
 *
 * Registration is production-only on purpose (a worker caching the shell while
 * `next dev` rewrites it is how somebody debugs a stale page), so no e2e test
 * can see this file. That left two things unasserted — the precache list, which
 * is hand-written, and the clean-up of superseded build output — and both are
 * exactly the kind of claim that rots silently, because a wrong worker still
 * serves a working page on the developer's machine.
 *
 * So the file is read as source and run in a sandbox with a fake `caches` and a
 * fake `fetch`: enough of the WorkerGlobalScope to drive the listeners the way
 * a browser would.
 */
const workerSource = readFileSync("apps/web/public/sw.js", "utf8");
const appDir = "apps/web/src/app";
const ORIGIN = "https://meditaur.test";

/** Every page the app serves, read from the filesystem rather than restated. */
function appRoutes(dir = appDir, segments: string[] = []): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      routes.push(...appRoutes(path.join(dir, entry.name), [...segments, entry.name]));
      continue;
    }
    if (entry.name !== "page.tsx") continue;
    // A route group is a folder the URL does not show.
    const visible = segments.filter((segment) => !segment.startsWith("("));
    routes.push(visible.length === 0 ? "/" : `/${visible.join("/")}`);
  }
  return routes;
}

function shellList(source = workerSource): string[] {
  const match = /const SHELL = (\[[^\]]*\]);/.exec(source);
  const raw = match?.[1];
  if (!raw) throw new Error("the worker has no SHELL list for this test to read");
  return JSON.parse(raw) as string[];
}

/** The cache the worker keeps, read from the file so a version bump cannot stale this. */
function cacheName(source = workerSource): string {
  const match = /const VERSION = "([^"]+)";/.exec(source);
  const raw = match?.[1];
  if (!raw) throw new Error("the worker has no VERSION for this test to read");
  return raw;
}

/**
 * Routes deliberately left out of the precache, each with the reason.
 *
 * The point of this map is that the decision is *written down*: a new screen
 * cannot be added and silently not work offline, and an entry here cannot
 * outlive the route it describes.
 */
const NOT_PRECACHED: Record<string, string> = {
  "/login": "signing in needs the network, so a cached copy could show a form that cannot act",
  "/signup": "same as /login",
  "/run/[instanceId]":
    "one URL per session, opened from a compiled plan; a session is not started offline",
};

type FakeRequest = { url: string } | string;

function keyOf(request: FakeRequest): string {
  return typeof request === "string" ? request : request.url;
}

function fakeResponse(url: string, body: string) {
  const self = {
    ok: true,
    url,
    text: async () => body,
    clone: () => self,
  };
  return self;
}

class FakeCache {
  readonly entries = new Map<string, { url: string; body: string }>();

  async put(request: FakeRequest, value: { text(): Promise<string> }): Promise<void> {
    const url = keyOf(request);
    this.entries.set(url, { url, body: await value.text() });
  }

  async match(request: FakeRequest) {
    const hit = this.entries.get(keyOf(request));
    return hit ? fakeResponse(hit.url, hit.body) : undefined;
  }

  async delete(request: FakeRequest): Promise<boolean> {
    return this.entries.delete(keyOf(request));
  }

  async keys() {
    return [...this.entries.values()].map((entry) => ({ url: entry.url }));
  }

  /** What `install` uses. The fake records the URL and does not fetch it. */
  async add(url: string): Promise<void> {
    this.entries.set(url, { url, body: "" });
  }
}

function loadWorker(fetchImpl: (request: unknown) => Promise<unknown>) {
  const cache = new FakeCache();
  const listeners = new Map<string, (event: never) => void>();
  vm.runInNewContext(workerSource, {
    self: {
      addEventListener: (type: string, listener: (event: never) => void) => listeners.set(type, listener),
      skipWaiting: () => undefined,
      clients: { claim: async () => undefined },
      location: { origin: ORIGIN },
    },
    caches: {
      open: async () => cache,
      keys: async () => [cacheName()],
      delete: async () => true,
      match: (request: FakeRequest) => cache.match(request),
    },
    fetch: fetchImpl,
    Response: { error: () => fakeResponse("", "") },
    URL,
    Set,
    Promise,
    JSON,
  });
  return { cache, listeners };
}

const doc = (asset: string) => `<!doctype html><script src="/_next/static/${asset}"></script>`;

describe("the service worker's precache list", () => {
  it("covers every route, or says in writing why it does not", () => {
    const shell = shellList();
    const routes = appRoutes();
    for (const route of routes) {
      if (shell.includes(route)) continue;
      expect(NOT_PRECACHED[route], `${route} is neither precached nor explained`).toBeTruthy();
    }
  });

  it("names no route the app does not serve, and no duplicate", () => {
    const shell = shellList();
    const routes = appRoutes();
    expect(new Set(shell).size).toBe(shell.length);
    for (const cached of shell) expect(routes, `${cached} is precached but is not a route`).toContain(cached);
    for (const route of Object.keys(NOT_PRECACHED)) {
      expect(routes, `${route} is explained away but is not a route`).toContain(route);
    }
  });
});

describe("the service worker's clean-up", () => {
  it("drops the build output the fresh document replaced, and nothing else", async () => {
    // A cache as a deploy leaves it: the document being replaced, its chunks,
    // and a chunk belonging to a route that has not been reopened since.
    const { cache, listeners } = loadWorker(async () => fakeResponse(`${ORIGIN}/plan`, doc("new.js")));
    cache.entries.set(`${ORIGIN}/plan`, { url: `${ORIGIN}/plan`, body: doc("old.js") });
    cache.entries.set(`${ORIGIN}/tuner`, { url: `${ORIGIN}/tuner`, body: doc("keep.js") });
    for (const asset of ["old.js", "keep.js", "new.js"]) {
      const url = `${ORIGIN}/_next/static/${asset}`;
      cache.entries.set(url, { url, body: "" });
    }

    const waits: Promise<unknown>[] = [];
    listeners.get("fetch")?.({
      request: { method: "GET", mode: "navigate", url: `${ORIGIN}/plan` },
      respondWith: (work: Promise<unknown>) => waits.push(work),
    } as never);
    await Promise.all(waits);
    // The clean-up is fired and not awaited by the response path, so the test
    // has to let the microtask queue drain before it looks.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(cache.entries.has(`${ORIGIN}/_next/static/old.js`)).toBe(false);
    expect(cache.entries.has(`${ORIGIN}/_next/static/new.js`)).toBe(true);
    // Still named by the cached `/tuner` document, so still the right bytes.
    expect(cache.entries.has(`${ORIGIN}/_next/static/keep.js`)).toBe(true);
    expect(cache.entries.has(`${ORIGIN}/plan`)).toBe(true);
  });

  it("also cleans up when the worker itself is activated", async () => {
    const { cache, listeners } = loadWorker(async () => fakeResponse(`${ORIGIN}/`, ""));
    cache.entries.set(`${ORIGIN}/plan`, { url: `${ORIGIN}/plan`, body: doc("new.js") });
    for (const asset of ["old.js", "new.js"]) {
      const url = `${ORIGIN}/_next/static/${asset}`;
      cache.entries.set(url, { url, body: "" });
    }

    const waits: Promise<unknown>[] = [];
    listeners.get("activate")?.({ waitUntil: (work: Promise<unknown>) => waits.push(work) } as never);
    await Promise.all(waits);

    expect(cache.entries.has(`${ORIGIN}/_next/static/old.js`)).toBe(false);
    expect(cache.entries.has(`${ORIGIN}/_next/static/new.js`)).toBe(true);
  });
});
