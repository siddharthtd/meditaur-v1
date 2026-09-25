import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_FEATURE_FLAGS, type FeatureFlagsPort } from "@meditaur/domain";
import { LOCAL_USER, createCachedFlags, db, dexieFlagsCache, ensureSeed } from "@meditaur/db";

/**
 * The device's own store, for real (`P0 · 38` — and the harness `P0 · 3a` needs).
 *
 * Every other suite here runs against memory ports, a hand-written fake or a live
 * project, which is why the flags' **device** half was never provable: the mirror is a
 * Dexie table, and the Node suites had no IndexedDB to hold one. `fake-indexeddb` is that
 * IndexedDB, and the point is not the fake — it is that everything above it is the code
 * that ships: the real `db`, the real cache, the real seed inside the real upgrade.
 *
 * Three properties, each of which only a real store can show:
 *
 *   - **The last answer the cloud gave stands when the cloud cannot be reached.** This is
 *     what slice 23c was built for, and until now it was asserted over a fake.
 *   - **A read that failed invents nothing.** The mirror is written only from an accepted
 *     read, so "still off in a tunnel" does not also mean "everything on the moment the
 *     network blinks".
 *   - **The store keeps its rows across a reopen**, which a hand-written fake cannot show
 *     either — and which is the ground the upgrade paths need: a Dexie version that has run
 *     is never re-run, and that is the trap this harness is now able to carry.
 */
const cloudDown: FeatureFlagsPort = {
  isConfigured: () => true,
  read: async () => {
    throw new Error("the cloud is not reachable");
  },
};

/** The port the app uses in a cloud build: the cloud first, this device's mirror when it fails. */
function deviceFlags(cloud: FeatureFlagsPort): FeatureFlagsPort {
  return createCachedFlags({
    auth: {
      isConfigured: () => true,
      getSession: async () => ({ userId: LOCAL_USER, expiresAt: null }),
      signIn: async () => ({ userId: LOCAL_USER, expiresAt: null }),
      signUp: async () => ({
        status: "signedIn" as const,
        session: { userId: LOCAL_USER, expiresAt: null },
      }),
      signOut: async () => {},
      onSessionChange: () => () => {},
    },
    cloud,
    local: dexieFlagsCache,
  });
}

/** A row the cloud once answered, as the mirror writes it: sparse, and this device's copy. */
async function accepted(flags: Record<string, boolean>): Promise<void> {
  await db.accountFlags.put({ userId: LOCAL_USER, isAdmin: false, flags, readAt: 1 });
}

describe("the device's own store", () => {
  beforeEach(async () => {
    await db.accountFlags.clear();
  });

  it("stands by the last answer the cloud gave when the cloud cannot be reached", async () => {
    await accepted({ binaural: false });

    const { flags } = await deviceFlags(cloudDown).read(LOCAL_USER);
    expect(flags.binaural, "the off this device last read stays off").toBe(false);
    expect(flags.chakras, "and a flag the row does not name is its default").toBe(true);
  });

  it("answers the defaults when it has never accepted one, and writes nothing", async () => {
    const { flags } = await deviceFlags(cloudDown).read(LOCAL_USER);
    expect(flags).toEqual(DEFAULT_FEATURE_FLAGS);
    expect(await db.accountFlags.count(), "a failure mirrored nothing").toBe(0);
  });

  it("reads a row written by an older build as a complete set", async () => {
    // The mirror is complete *as of the build that wrote it*, and a flag added since is
    // filled in on the way out rather than read as off — which is what makes the row safe
    // to keep across a release. `readAt` is its own record and decides nothing.
    await accepted({ chakras: false });

    const { flags } = await deviceFlags(cloudDown).read(LOCAL_USER);
    expect(flags.chakras).toBe(false);
    for (const [name, value] of Object.entries(DEFAULT_FEATURE_FLAGS)) {
      if (name === "chakras") continue;
      expect(flags[name as keyof typeof DEFAULT_FEATURE_FLAGS], name).toBe(value);
    }
  });

  it("keeps its rows across a reopen", async () => {
    // The seed is the app's own path — `bootstrap` calls it, and it caches its promise — so
    // this is the real catalogue rather than a fixture. What the reopen proves is the half a
    // fake cannot: the rows are still there, and opening an upgraded database again does not
    // write the catalogue a second time.
    await ensureSeed();
    await accepted({ binaural: false });
    const symbols = await db.symbols.count();
    expect(symbols, "a seeded store has a catalogue").toBeGreaterThan(0);

    db.close();
    await db.open();

    expect(await db.symbols.count(), "the catalogue is still there, once").toBe(symbols);
    const { flags } = await deviceFlags(cloudDown).read(LOCAL_USER);
    expect(flags.binaural, "and so is the row the cloud last answered").toBe(false);
  });
});
