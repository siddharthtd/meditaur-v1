import { describe, expect, it } from "vitest";
import { FakeClock } from "@meditaur/domain";
import { symbolRow } from "../../../packages/db/src/catalogue-rows.ts";
import { createLocalSyncPort, createSyncPort } from "../../../packages/db/src/sync-port.ts";
import { fakeSupabaseData } from "../../fixtures/supabase-data.ts";
import { fakeLocal, fakeState, WORKSPACE } from "../../fixtures/sync-local.ts";
import { makeSymbol } from "../../fixtures/library.ts";

/**
 * The two sync adapters (`P2 · 3`, slice 3): the binding the app is handed, and the null
 * object a build with no cloud pair gets instead.
 *
 * The protocol's own rules are not re-tested here — `sync-push`, `sync-pull` and
 * `sync-plans` hold those. What this file is for is the thing those cannot see: that the
 * seam really is wired to both stores, to the marks and to the workspace it was given. A
 * factory that dropped the workspace, or forgot the watermark store, would pass every
 * test in those three files and sync the wrong thing for ever.
 */
const AT = 1_700_000_000_000;

describe("the sync adapters", () => {
  it("binds the device, the marks and the cloud, and syncs the workspace it is given", async () => {
    const local = fakeLocal({ symbols: [makeSymbol("s1", "Lam", { updatedAt: AT })] });
    const cloud = fakeSupabaseData();
    const state = fakeState();

    const port = createSyncPort({
      client: cloud.client,
      state: state.port,
      clock: new FakeClock(),
      local: local.store,
    });

    // The workspace is the caller's, and another one's rows do not travel: this is the
    // assertion that would fail if the factory dropped its argument and reached for a
    // workspace of its own.
    await expect(port.run("ws-elsewhere")).resolves.toEqual({ sent: 0, received: 0, written: 0 });
    expect(cloud.rows("symbols")).toHaveLength(0);

    const outcome = await port.run(WORKSPACE);
    expect(outcome.sent, "the device's one symbol").toBe(1);
    expect(cloud.rows("symbols")).toHaveLength(1);
    // The pull then reads that same row back — the push happened first, so it is past the
    // read mark — and writes nothing: same revision, and a tie loses. That is the
    // round-trip the factory is for, and it is why a run is idempotent.
    expect({ received: outcome.received, written: outcome.written }).toEqual({
      received: 1,
      written: 0,
    });
    // The marks are the store's, not the protocol's memory: a run that does not write them
    // sends everything again on the next run and never stops. The read mark lands one
    // millisecond *behind* the row it read, so the group at that instant is read again
    // next time rather than hidden behind its own timestamp.
    expect(state.marks.get("symbols")?.pushedAt).toBe(AT);
    expect(state.marks.get("symbols")?.pulledAt).toBe(AT - 1);
  });

  it("pulls what the cloud holds into the device's own store", async () => {
    // The other direction, and the one that proves the local store really is bound
    // rather than a stub: a row only the cloud has has to be *written* here.
    const local = fakeLocal();
    const cloud = fakeSupabaseData({
      symbols: [
        symbolRow(makeSymbol("s1", "Lam", { updatedAt: AT, revision: 1, deletedAt: null })),
      ],
    });

    const port = createSyncPort({
      client: cloud.client,
      state: fakeState().port,
      clock: new FakeClock(),
      local: local.store,
    });

    const outcome = await port.run(WORKSPACE);
    expect(outcome.received).toBe(1);
    expect(outcome.written).toBe(1);
    expect(local.stores.symbols.map((symbol) => symbol.id)).toEqual(["s1"]);
  });

  it("answers nothing sent and nothing received where there is no cloud pair", async () => {
    // The null object: a local-only build is wired to this rather than to nothing, so no
    // caller has to ask whether syncing is possible. It has no store and no client to
    // reach, so it cannot fail and cannot touch anything.
    await expect(createLocalSyncPort().run(WORKSPACE)).resolves.toEqual({
      sent: 0,
      received: 0,
      written: 0,
    });
  });
});
