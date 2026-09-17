import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimRunnerLock,
  heartbeatRunnerLock,
  releaseRunnerLock,
} from "../../../apps/web/src/lib/engine-lock.ts";

describe("runner tab lock", () => {
  let now = 10_000;

  beforeEach(() => {
    now = 10_000;
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
    });
    vi.spyOn(Date, "now").mockImplementation(() => now);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("refuses a second tab until the owner heartbeat goes stale", () => {
    expect(claimRunnerLock("u1", "a")).toBe(true);
    expect(claimRunnerLock("u1", "b")).toBe(false);
    heartbeatRunnerLock("u1", "b");
    expect(claimRunnerLock("u1", "b")).toBe(false);
    now += 4999;
    expect(claimRunnerLock("u1", "b")).toBe(false);
    now += 2;
    expect(claimRunnerLock("u1", "b")).toBe(true);
  });

  it("lets another tab start after release", () => {
    expect(claimRunnerLock("u1", "a")).toBe(true);
    releaseRunnerLock("u1", "b");
    expect(claimRunnerLock("u1", "b")).toBe(false);
    releaseRunnerLock("u1", "a");
    expect(claimRunnerLock("u1", "b")).toBe(true);
  });

  it("keeps a second signed-in user out of the first user's lock", () => {
    // One device, two people signed in (review: the lock was profile-scoped).
    expect(claimRunnerLock("u1", "a")).toBe(true);
    expect(claimRunnerLock("u2", "b")).toBe(true);
    // ...and releasing one must not touch the other.
    releaseRunnerLock("u2", "b");
    expect(claimRunnerLock("u1", "c")).toBe(false);
    expect(claimRunnerLock("u2", "c")).toBe(true);
  });

  it("never claims a lock without a scope", () => {
    expect(claimRunnerLock("", "a")).toBe(false);
    expect(claimRunnerLock("u1", "a")).toBe(true);
  });
});
