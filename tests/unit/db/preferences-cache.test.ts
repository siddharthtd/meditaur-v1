import { describe, expect, it } from "vitest";
import { stampedPreferences } from "@meditaur/application";
import type { AuthPort, PreferencesRepository, UserPreferences } from "@meditaur/domain";
import { createCachedPreferences } from "../../../packages/db/src/preferences-cache.ts";
import type { LocalPreferences } from "../../../packages/db/src/ports.ts";
import { makePrefs } from "../../fixtures/library.ts";

function fakeAuth(userId: string | null): AuthPort {
  return {
    isConfigured: () => userId !== null,
    async getSession() {
      return userId ? { userId, expiresAt: null } : null;
    },
    async signIn() {
      throw new Error("not used");
    },
    async signUp() {
      throw new Error("not used");
    },
    async signOut() {},
    onSessionChange: () => () => {},
  };
}

/** A store with the same compare-and-swap contract the real ones implement. */
function fakeStore(initial: UserPreferences | null = null, failWith?: string) {
  let row = initial ? { ...initial } : null;
  const calls: string[] = [];
  const store: PreferencesRepository = {
    async get() {
      calls.push("get");
      if (failWith) throw new Error(failWith);
      return row ? { ...row } : null;
    },
    async save(prefs) {
      calls.push(`save r${prefs.revision}`);
      if (failWith) throw new Error(failWith);
      if (row && row.revision !== prefs.revision) return null;
      row = { ...prefs, revision: prefs.revision + 1 };
      return { ...row };
    },
  };
  return { calls, store, current: () => row, write: (prefs: UserPreferences) => { row = { ...prefs }; } };
}

/** The local copy: the port plus the one unconditional write the mirror needs. */
function fakeLocal(initial: UserPreferences | null = null) {
  const store = fakeStore(initial);
  const copies: number[] = [];
  const local: LocalPreferences = {
    ...store.store,
    async writeCopy(prefs) {
      copies.push(prefs.revision);
      store.write(prefs);
    },
  };
  return { ...store, copies, local };
}

describe("cached preferences", () => {
  it("reads through the cloud and keeps the offline copy in step", async () => {
    const cloud = fakeStore(makePrefs({ revision: 4, textSize: "xl" }));
    const local = fakeLocal(makePrefs({ revision: 2, textSize: "lg" }));
    const port = createCachedPreferences({
      auth: fakeAuth("u1"),
      cloud: cloud.store,
      local: local.local,
    });

    expect(await port.get("u1")).toMatchObject({ revision: 4, textSize: "xl" });
    // The copy holds what the cloud just said, revision included, so a read with
    // no network is not a stale read of a different version.
    expect(local.current()).toMatchObject({ revision: 4, textSize: "xl" });
  });

  it("answers from the copy when the cloud cannot be reached", async () => {
    const cloud = fakeStore(makePrefs({ revision: 4 }), "offline");
    const local = fakeLocal(makePrefs({ revision: 4, textSize: "xl" }));
    const port = createCachedPreferences({
      auth: fakeAuth("u1"),
      cloud: cloud.store,
      local: local.local,
    });

    expect(await port.get("u1")).toMatchObject({ revision: 4, textSize: "xl" });
  });

  it("stays local for a reader the session does not name", async () => {
    const cloud = fakeStore(makePrefs({ revision: 9 }));
    const local = fakeLocal(makePrefs({ revision: 1, textSize: "lg" }));
    const port = createCachedPreferences({
      auth: fakeAuth(null),
      cloud: cloud.store,
      local: local.local,
    });

    expect(await port.get("u1")).toMatchObject({ revision: 1, textSize: "lg" });
    expect(cloud.calls).toEqual([]);

    const stored = await port.save(stampedPreferences(makePrefs({ revision: 1 }), 10));
    expect(stored).toMatchObject({ revision: 2 });
    expect(cloud.calls).toEqual([]);
  });

  it("mirrors a write only after the cloud accepted it", async () => {
    const cloud = fakeStore(makePrefs({ revision: 7 }));
    const local = fakeLocal(makePrefs({ revision: 7 }));
    const port = createCachedPreferences({
      auth: fakeAuth("u1"),
      cloud: cloud.store,
      local: local.local,
    });

    const accepted = stampedPreferences(makePrefs({ revision: 7, textSize: "xl" }), 20);
    expect(await port.save(accepted)).toMatchObject({ revision: 8 });
    expect(local.copies).toEqual([8]);

    // A refused write is not mirrored: the copies must not disagree about a
    // revision nobody wrote.
    const stale = stampedPreferences(makePrefs({ revision: 7 }), 30);
    expect(await port.save(stale)).toBeNull();
    expect(local.copies).toEqual([8]);
    expect(cloud.current()).toMatchObject({ revision: 8, textSize: "xl" });
  });

  it("lets a failed cloud write through rather than saving locally behind it", async () => {
    const cloud = fakeStore(makePrefs({ revision: 1 }), "offline");
    const local = fakeLocal(makePrefs({ revision: 1 }));
    const port = createCachedPreferences({
      auth: fakeAuth("u1"),
      cloud: cloud.store,
      local: local.local,
    });

    // No offline mutation queue: the reader is told, and nothing is written
    // twice from two directions.
    await expect(port.save(stampedPreferences(makePrefs({ revision: 1 }), 5))).rejects.toThrow(
      "offline",
    );
    expect(local.current()).toMatchObject({ revision: 1 });
  });
});
