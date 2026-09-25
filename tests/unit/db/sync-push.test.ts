import { describe, expect, it } from "vitest";
import { fakeSupabaseData } from "../../fixtures/supabase-data.ts";
import { fakeLocal, fakeState, makeAsset, makeValue, WORKSPACE } from "../../fixtures/sync-local.ts";
import {
  makeEntry,
  makeFieldDef,
  makeFieldOption,
  makeIntention,
  makeMeditation,
  makeMeditationType,
  makePreset,
  makeSymbol,
} from "../../fixtures/library.ts";
import { pushCatalogue, SYNC_TABLES } from "../../../packages/db/src/sync.ts";

/**
 * The push (`P2 · 3`, slice 3): what a device sends, and what it is allowed to claim
 * afterwards.
 *
 * Both sides are fakes that **store** rather than count — the cloud's is
 * `fakeSupabaseData`, the same one the cloud adapters are tested against, and the local
 * one is a `Map` per store. That is what lets this be a unit test at all: the protocol's
 * only store surface is `SyncLocalStore`, so no IndexedDB is needed, and a mock that
 * counted calls would let a mapper speaking the wrong column names pass.
 *
 * The two properties the design leans on are the ones to keep an eye on:
 * `rowsPast` sends the rows sitting exactly on the watermark, so a change is re-sent on
 * the next run rather than only once; and a delete travels as an ordinary row, because
 * the row *is* the tombstone.
 */
const AT = 1_700_000_000_000;

describe("the catalogue push", () => {
  it("carries every catalogue table, one row each", async () => {
    // The completeness case: a table left out of the walk is a table that never syncs,
    // and nothing else in this file would notice.
    const local = fakeLocal({
      meditationTypes: [makeMeditationType({ updatedAt: AT })],
      focusPoints: [makeMeditation("fp1", "Root", { updatedAt: AT })],
      symbols: [makeSymbol("s1", "Lam", { updatedAt: AT })],
      entries: [makeEntry("fp1", "s1", 0, { updatedAt: AT })],
      intentions: [makeIntention("l1", "I am calm", { entryId: "e1", updatedAt: AT })],
      fieldDefs: [makeFieldDef({ id: "f1", updatedAt: AT })],
      fieldOptions: [makeFieldOption({ id: "o1", updatedAt: AT })],
      fieldValuesByEntity: [makeValue("s1", "f1", AT)],
      mediaAssets: [makeAsset("a1", AT)],
      presets: [makePreset({ updatedAt: AT })],
    });
    const cloud = fakeSupabaseData();
    const state = fakeState();

    const report = await pushCatalogue({
      local: local.store,
      cloud: cloud.client,
      state: state.port,
      workspaceId: WORKSPACE,
    });

    expect(report.sent).toBe(SYNC_TABLES.length);
    for (const table of [
      "meditation_types",
      "meditations",
      "symbols",
      "entries",
      "intentions",
      "field_defs",
      "field_options",
      "field_values",
      "media_assets",
      "binaural_presets",
    ]) {
      expect(cloud.rows(table), `${table} was not sent`).toHaveLength(1);
    }
    // Every table's mark moved to the row it wrote.
    for (const table of SYNC_TABLES) expect(state.marks.get(table)?.pushedAt).toBe(AT);
  });

  it("sends a row in the table's own column names, not the domain's", async () => {
    const local = fakeLocal({ symbols: [makeSymbol("s1", "Lam", { updatedAt: AT })] });
    const cloud = fakeSupabaseData();

    await pushCatalogue({
      local: local.store,
      cloud: cloud.client,
      state: fakeState().port,
      workspaceId: WORKSPACE,
    });

    const row = cloud.rows("symbols")[0]!;
    expect(row.id).toBe("s1");
    expect(row.workspace_id).toBe(WORKSPACE);
    expect(Object.keys(row)).toContain("image_asset_id");
    expect(Object.keys(row)).toContain("reiki_system");
    expect(row.deleted_at).toBeNull();
  });

  it("sends a delete as the row it already is, not as a removal", async () => {
    // The local store marks rather than removing (`delete-mark.ts`), so a tombstone is
    // an ordinary row by the time the push sees it — one upsert, no delete call.
    const local = fakeLocal({
      symbols: [makeSymbol("s1", "Lam", { updatedAt: AT, deletedAt: AT, revision: 4 })],
    });
    const cloud = fakeSupabaseData();

    await pushCatalogue({
      local: local.store,
      cloud: cloud.client,
      state: fakeState().port,
      workspaceId: WORKSPACE,
    });

    const rows = cloud.rows("symbols");
    expect(rows, "the row is still there").toHaveLength(1);
    expect(rows[0]!.deleted_at).toBe(new Date(AT).toISOString());
    // The mark's own revision travels with it: bumping it here would put this device
    // and its cloud one revision apart for no reason.
    expect(rows[0]!.revision).toBe(4);
    expect(cloud.calls.filter((call) => call.startsWith("upsert"))).toHaveLength(1);
  });

  it("sends everything from a cold start, then only the rows the mark has reached", async () => {
    // Two halves of one rule. With no mark at all every row is due — a device that has
    // never synced owes the cloud its whole catalogue. Once the mark sits on the newest
    // row, `rowsPast` is `>=`, so that row is sent again on every run, which is what
    // carries a higher revision past a device that pushed a lower one last, while an
    // older row the mark has already passed stays where it is.
    const local = fakeLocal({
      symbols: [
        makeSymbol("s1", "Lam", { updatedAt: AT }),
        makeSymbol("s2", "Zonar", { updatedAt: AT - 500 }),
      ],
    });
    const cloud = fakeSupabaseData();

    const cold = fakeState();
    const firstEver = await pushCatalogue({
      local: local.store,
      cloud: cloud.client,
      state: cold.port,
      workspaceId: WORKSPACE,
    });
    expect(firstEver.sent, "a device that has never synced sends its whole table").toBe(2);
    expect(cold.marks.get("symbols")?.pushedAt, "the mark moved to what it wrote").toBe(AT);
    expect(
      cold.marks.get("symbols")?.pulledAt,
      "and the push did not touch the direction it does not own",
    ).toBe(-1);

    const warm = fakeState([{ table: "symbols", pushedAt: AT, pulledAt: 0 }]);
    const first = await pushCatalogue({
      local: local.store,
      cloud: cloud.client,
      state: warm.port,
      workspaceId: WORKSPACE,
    });
    const second = await pushCatalogue({
      local: local.store,
      cloud: cloud.client,
      state: warm.port,
      workspaceId: WORKSPACE,
    });

    expect(first.sent, "the row on the mark is due; the older one is behind it").toBe(1);
    expect(second.sent, "and it stays due until something newer arrives").toBe(1);
    expect(cloud.rows("symbols"), "the cloud still holds both rows").toHaveLength(2);
    expect(warm.marks.get("symbols")?.pushedAt).toBe(AT);
  });

  it("leaves a table's mark alone when it sent nothing", async () => {
    // A row older than the mark is not due, and an empty batch must not move the mark:
    // moving it would skip whatever the mark was still holding the door open for.
    const local = fakeLocal({ symbols: [makeSymbol("s1", "Lam", { updatedAt: AT - 500 })] });
    const state = fakeState([{ table: "symbols", pushedAt: AT, pulledAt: 0 }]);

    const report = await pushCatalogue({
      local: local.store,
      cloud: fakeSupabaseData().client,
      state: state.port,
      workspaceId: WORKSPACE,
    });

    expect(report.sent).toBe(0);
    expect(state.marks.get("symbols")).toEqual({ table: "symbols", pushedAt: AT, pulledAt: 0 });
  });

  it("carries a deleted entity's values with it", async () => {
    // `field_values` is scoped by its entity, and the ids come from the rows the device
    // holds — **marked ones included**, because a deleted meditation's values carry the
    // mark with it and this list is their only way off the device.
    const local = fakeLocal({
      focusPoints: [makeMeditation("fp1", "Root", { updatedAt: AT, deletedAt: AT, revision: 3 })],
      fieldValuesByEntity: [makeValue("fp1", "f1", AT)],
    });
    const cloud = fakeSupabaseData();

    await pushCatalogue({
      local: local.store,
      cloud: cloud.client,
      state: fakeState().port,
      workspaceId: WORKSPACE,
    });

    const values = cloud.rows("field_values");
    expect(values, "the value of a deleted meditation still travels").toHaveLength(1);
    expect(values[0]!.entity_id).toBe("fp1");
    expect(values[0]!.field_def_id).toBe("f1");
  });

  it("walks nothing but this workspace's rows", async () => {
    const local = fakeLocal({
      symbols: [
        makeSymbol("s1", "Lam", { updatedAt: AT }),
        makeSymbol("s2", "Other device", { workspaceId: "ws2", updatedAt: AT }),
      ],
    });
    const cloud = fakeSupabaseData();

    await pushCatalogue({
      local: local.store,
      cloud: cloud.client,
      state: fakeState().port,
      workspaceId: WORKSPACE,
    });

    expect(cloud.rows("symbols").map((row) => row.id)).toEqual(["s1"]);
  });
});
