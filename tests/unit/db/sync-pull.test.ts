import { describe, expect, it } from "vitest";
import { fakeSupabaseData } from "../../fixtures/supabase-data.ts";
import { fakeLocal, fakeState, makeAsset, makeValue, WORKSPACE } from "../../fixtures/sync-local.ts";
import { makeFieldDef, makeMeditation, makeSymbol } from "../../fixtures/library.ts";
import { pullCatalogue } from "../../../packages/db/src/sync.ts";
import { symbolRow } from "../../../packages/db/src/catalogue-rows.ts";
import { meditationRow } from "../../../packages/db/src/meditation-row.ts";
import { fieldDefRow } from "../../../packages/db/src/field-def-row.ts";
import { fieldValueRow } from "../../../packages/db/src/field-rows.ts";
import { mediaAssetRow } from "../../../packages/db/src/media-asset-row.ts";

/**
 * The pull (`P2 · 3`, slice 3): what a device takes, and what it refuses to believe.
 *
 * The cloud's fake is `fakeSupabaseData`, whose `selectRange` orders by the column it
 * filters on and stops at the limit — the shape a real pull reads — and the device's is
 * a `Map`, because the unit suite has no IndexedDB.
 *
 * The cases that matter most are the two about *stopping*: a batch that ends inside a
 * group of rows sharing one timestamp, and the merge that keeps a lower revision. The
 * first is not hypothetical — every seeded row carries `updatedAt: 0`, so the first pull
 * of a catalogue is one enormous group at the epoch.
 */
const AT = 1_700_000_000_000;

/** The cloud rows of a symbol, `updatedAt` and mark and all, as the mappers write them. */
function cloudSymbol(id: string, name: string, extra: { updatedAt: number; revision?: number; deletedAt?: number | null }) {
  return symbolRow(
    makeSymbol(id, name, {
      updatedAt: extra.updatedAt,
      revision: extra.revision ?? 0,
      deletedAt: extra.deletedAt ?? null,
    }),
  );
}

describe("the catalogue pull", () => {
  it("takes a whole tie group, even when a batch ends inside it", async () => {
    // Five rows share one timestamp and the batch holds two. A pull that stopped at the
    // batch would move its mark past the other three and never look at them again, so
    // each batch finishes the group at its newest row.
    const cloud = fakeSupabaseData({
      symbols: [
        cloudSymbol("s1", "Lam", { updatedAt: 0 }),
        cloudSymbol("s2", "Zonar", { updatedAt: 0 }),
        cloudSymbol("s3", "Rama", { updatedAt: 0 }),
        cloudSymbol("s4", "Gnosa", { updatedAt: 0 }),
        cloudSymbol("s5", "Iawa", { updatedAt: 0 }),
      ],
    });
    const local = fakeLocal();
    const state = fakeState();

    const report = await pullCatalogue({
      local: local.store,
      cloud: cloud.client,
      state: state.port,
      workspaceId: WORKSPACE,
      limit: 2,
    });

    expect(local.stores.symbols.map((row) => row.id).sort()).toEqual([
      "s1",
      "s2",
      "s3",
      "s4",
      "s5",
    ]);
    expect(report.written).toBe(5);
  });

  it("takes the rows past the window in the batches they come in", async () => {
    const cloud = fakeSupabaseData({
      symbols: [
        cloudSymbol("s1", "Lam", { updatedAt: 0 }),
        cloudSymbol("s2", "Zonar", { updatedAt: 0 }),
        cloudSymbol("s3", "Rama", { updatedAt: AT }),
        cloudSymbol("s4", "Gnosa", { updatedAt: AT }),
      ],
    });
    const local = fakeLocal();
    const state = fakeState();

    await pullCatalogue({
      local: local.store,
      cloud: cloud.client,
      state: state.port,
      workspaceId: WORKSPACE,
      limit: 2,
    });

    expect(local.stores.symbols.map((row) => row.id).sort()).toEqual(["s1", "s2", "s3", "s4"]);
    // The mark ends one millisecond behind the newest row it read, which is what a row
    // written at that same instant is counting on.
    expect(state.marks.get("symbols")?.pulledAt).toBe(AT - 1);
  });

  it("keeps the higher revision and refuses the lower one", async () => {
    // Two rows, one each way: `s1` is ahead here and `s2` is ahead in the cloud. The pull
    // writes one and leaves the other, which is the whole of what "settled by revision"
    // means on the way in (`DECISIONS.md` §7).
    const cloud = fakeSupabaseData({
      symbols: [
        cloudSymbol("s1", "Cloud name", { updatedAt: AT, revision: 2 }),
        cloudSymbol("s2", "Cloud name", { updatedAt: AT, revision: 2 }),
      ],
    });
    const local = fakeLocal({
      symbols: [
        makeSymbol("s1", "This device", { updatedAt: AT - 50, revision: 3 }),
        makeSymbol("s2", "This device", { updatedAt: AT - 50, revision: 1 }),
      ],
    });

    const report = await pullCatalogue({
      local: local.store,
      cloud: cloud.client,
      state: fakeState().port,
      workspaceId: WORKSPACE,
    });

    expect(report.received, "the group is finished only when a batch was cut short").toBe(2);
    expect(report.written, "only the row whose revision is ahead").toBe(1);
    expect(local.stores.symbols.find((row) => row.id === "s1")?.name, "the newer copy stays").toBe(
      "This device",
    );
    expect(local.stores.symbols.find((row) => row.id === "s2")?.name, "and the older gives way").toBe(
      "Cloud name",
    );
  });

  it("writes a cloud tombstone as a mark, and never as a removal", async () => {
    // The row stays, marked: the device's own reads filter it out (`notDeleted`), and the
    // mark is what lets the delete travel on to a third device.
    const cloud = fakeSupabaseData({
      symbols: [cloudSymbol("s1", "Lam", { updatedAt: AT, revision: 2, deletedAt: AT })],
    });
    const local = fakeLocal();

    await pullCatalogue({
      local: local.store,
      cloud: cloud.client,
      state: fakeState().port,
      workspaceId: WORKSPACE,
    });

    const row = local.stores.symbols.find((held) => held.id === "s1");
    expect(row, "the row is still there").toBeDefined();
    expect(row?.deletedAt).toBe(AT);
  });

  it("writes nothing when it looks a second time", async () => {
    const cloud = fakeSupabaseData({
      symbols: [cloudSymbol("s1", "Lam", { updatedAt: AT, revision: 1 })],
    });
    const local = fakeLocal();
    const state = fakeState();
    const input = { local: local.store, cloud: cloud.client, state: state.port, workspaceId: WORKSPACE };

    const first = await pullCatalogue(input);
    const second = await pullCatalogue(input);

    expect(first.written).toBe(1);
    // The second look re-reads the boundary group — that is the millisecond the mark
    // stands behind — and writes none of it, because nothing's revision moved.
    expect(second.received).toBeGreaterThan(0);
    expect(second.written).toBe(0);
    expect(local.stores.symbols).toHaveLength(1);
  });

  it("does not touch the direction the pull does not own", async () => {
    const cloud = fakeSupabaseData({ symbols: [cloudSymbol("s1", "Lam", { updatedAt: AT })] });
    const state = fakeState([{ table: "symbols", pushedAt: AT - 9, pulledAt: -1 }]);

    await pullCatalogue({
      local: fakeLocal().store,
      cloud: cloud.client,
      state: state.port,
      workspaceId: WORKSPACE,
    });

    expect(state.marks.get("symbols")?.pushedAt, "the push's mark is the push's").toBe(AT - 9);
  });

  it("takes a value only for an entity the device holds", async () => {
    // `field_values` has no workspace and no id to page on, so it is pulled the way it is
    // pushed: by the entities this device has. A value whose entity is not here has no
    // row to hang off, and pulling it would be writing a row for nothing.
    const cloud = fakeSupabaseData({
      meditations: [meditationRow(makeMeditation("m1", "Root", { updatedAt: AT }))],
      field_defs: [fieldDefRow(makeFieldDef({ id: "f1", updatedAt: AT }))],
      field_values: [
        fieldValueRow(makeValue("m1", "f1", AT, "here")),
        fieldValueRow(makeValue("m999", "f1", AT, "not here")),
      ],
    });
    const local = fakeLocal();

    await pullCatalogue({
      local: local.store,
      cloud: cloud.client,
      state: fakeState().port,
      workspaceId: WORKSPACE,
    });

    expect(local.stores.fieldValuesByEntity.map((value) => value.text)).toEqual(["here"]);
    expect(local.stores.meditationTypes, "the tables it has nothing for stay empty").toHaveLength(0);
  });

  it("walks a table with nothing in it and leaves its mark alone", async () => {
    const cloud = fakeSupabaseData({ media_assets: [mediaAssetRow(makeAsset("a1", AT))] });
    const local = fakeLocal();
    const state = fakeState();

    const report = await pullCatalogue({
      local: local.store,
      cloud: cloud.client,
      state: state.port,
      workspaceId: WORKSPACE,
    });

    expect(local.stores.mediaAssets.map((asset) => asset.id)).toEqual(["a1"]);
    expect(report.written).toBe(1);
    expect(
      state.marks.get("symbols"),
      "an empty table leaves no mark at all, which reads as the same as never synced",
    ).toBeUndefined();
  });
});
