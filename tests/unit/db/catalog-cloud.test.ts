import { describe, expect, it } from "vitest";
import { FakeClock } from "@meditaur/domain";
import { fakeSupabaseData } from "../../fixtures/supabase-data.ts";
import { createCloudCatalogPort } from "../../../packages/db/src/catalog-cloud.ts";
import {
  makeEntry,
  makeFieldDef,
  makeFieldOption,
  makeIntention,
  makeMeditation,
  makePreset,
  makeSymbol,
} from "../../fixtures/library.ts";
import { entryRow, intentionRow, symbolRow } from "../../../packages/db/src/catalogue-rows.ts";
import { meditationRow } from "../../../packages/db/src/meditation-row.ts";
import { presetRow } from "../../../packages/db/src/preset-row.ts";

const AT = 1_700_000_000_000;

/** The adapter over a fresh fake, with a clock the test can move. */
function harness(initial: Record<string, Record<string, unknown>[]> = {}) {
  const fake = fakeSupabaseData(initial);
  // `FakeClock` starts at zero and is advanced to the test's instant, so every mark
  // the adapter writes carries a time the test can name.
  const clock = new FakeClock();
  clock.advance(AT);
  return { ...fake, port: createCloudCatalogPort({ client: fake.client, clock }) };
}

describe("the cloud catalogue adapter", () => {
  it("saves a row in the table's own column names", async () => {
    const { port, rows, calls } = harness();
    await port.saveMeditation(makeMeditation("fp1", "Root"));

    expect(rows("meditations")).toHaveLength(1);
    expect(Object.keys(rows("meditations")[0]!)).toContain("type_id");
    // One request per row, which is the whole reason `upsert` joined the seam: the
    // preferences dance of `updateWhere` then `insert` would be three.
    expect(calls).toEqual(["upsert meditations"]);
  });

  it("saves a row it already holds rather than colliding with it", async () => {
    const meditation = makeMeditation("fp1", "Root");
    const { port, rows } = harness({ meditations: [meditationRow(meditation)] });

    await port.saveMeditation({ ...meditation, name: "Rooted", revision: 1 });
    expect(rows("meditations")).toHaveLength(1);
    expect(rows("meditations")[0]!.name).toBe("Rooted");
  });

  it("deletes as a write: the row stays, marked and one revision on", async () => {
    const symbol = makeSymbol("s1", "Lam");
    const { port, rows } = harness({ symbols: [symbolRow(symbol)] });
    const before = rows("symbols")[0]!.revision as number;

    await port.deleteSymbol("s1");

    // Not a removal — an absence cannot travel, which is what slice 1's mark is for.
    expect(rows("symbols")).toHaveLength(1);
    const after = rows("symbols")[0]!;
    expect(after.deleted_at).toBe(new Date(AT).toISOString());
    // The timestamp a pull reads has to move with the mark, or the tombstone is
    // never seen by the device that has to hear about it.
    expect(after.updated_at).toBe(new Date(AT).toISOString());
    expect(after.revision).toBe(before + 1);
  });

  it("writes nothing when the row it is asked to delete is not there", async () => {
    const { port, rows, calls } = harness();
    await port.deleteSymbol("never-existed");
    expect(rows("symbols")).toEqual([]);
    expect(calls).toEqual(["select symbols * where id=never-existed"]);
  });

  it("marks an entry's lines with it, because the server's cascade will not fire", async () => {
    // The one cascade this adapter has to write by hand: Postgres deletes a row's
    // lines with it, but only on a real `delete`, and a delete here is a mark. Left
    // alone, the lines would travel as live rows pointing at a marked entry and the
    // local store — which had deleted them — would pull them back.
    const line = makeIntention("l1", "I am calm", { entryId: "e1", deletedAt: null });
    const { port, rows } = harness({
      entries: [entryRow(makeEntry("fp1", "s1", 0, { id: "e1" }))],
      intentions: [intentionRow(line)],
    });

    await port.deleteEntry("e1");

    expect(rows("intentions")).toHaveLength(1);
    expect(rows("intentions")[0]!.deleted_at).toBe(new Date(AT).toISOString());
    expect(rows("entries")).toHaveLength(1);
    expect(rows("entries")[0]!.deleted_at).toBe(new Date(AT).toISOString());
  });

  it("marks only the lines when that is what was asked", async () => {
    const line = makeIntention("l1", "I am calm", { entryId: "e1", deletedAt: null });
    const { port, rows } = harness({ intentions: [intentionRow(line)] });

    await port.deleteIntentionsForEntry("e1");

    expect(rows("intentions")[0]!.deleted_at).toBe(new Date(AT).toISOString());
    // The entry itself is untouched: this call is the cascade's second half, not
    // the delete.
    expect(rows("entries")).toEqual([]);
  });

  it("reads the entity's own values, and marks only the pair asked for", async () => {
    const { port, rows } = harness({
      field_values: [
        { entity_id: "fp1", field_def_id: "d1", text: "one", revision: 0, updated_at: null },
        { entity_id: "fp1", field_def_id: "d2", text: "two", revision: 0, updated_at: null },
      ],
    });

    await port.deleteFieldValue("fp1", "d2");

    const marked = rows("field_values").filter((row) => row.deleted_at != null);
    expect(marked.map((row) => row.field_def_id)).toEqual(["d2"]);
  });

  it("asks for the values of a set of entities in one read", async () => {
    const { port, calls } = harness();
    await port.listFieldValuesForEntityIds(["fp1", "s1"]);
    // The `in` the pull needs, and the reason `selectIn` was added alongside
    // `selectRange`: `field_values` is scoped by its entity, not by a workspace.
    expect(calls).toEqual(["selectIn field_values * where entity_id in 2"]);
  });

  it("lists media in the store's own order, not the rows' arrival", async () => {
    const assets = [
      { id: "a2", workspace_id: "ws1", kind: "ambient", name: "Rain", storage_path: "p", duration_ms: 1, sort_order: 5, revision: 0, updated_at: null, deleted_at: null },
      { id: "a1", workspace_id: "ws1", kind: "ambient", name: "Sea", storage_path: "p", duration_ms: 1, sort_order: 1, revision: 0, updated_at: null, deleted_at: null },
    ];
    const { port } = harness({ media_assets: assets });
    expect((await port.listMediaAssets("ws1")).map((row) => row.id)).toEqual(["a1", "a2"]);
  });

  it("composes the whole library from the cloud, field defs and presets included", async () => {
    // `loadCompileLibrary` is the one read that needs a table the port has no other
    // door to (`field_defs`) and one that is not this port's at all (the presets, read
    // for the plan editor). It is deliberately unscoped: the plan-scoped branch
    // belongs to the read path, which stays Dexie.
    const meditation = makeMeditation("fp1", "Root");
    const symbol = makeSymbol("s1", "Lam");
    const { port } = harness({
      meditations: [meditationRow(meditation)],
      symbols: [symbolRow(symbol)],
      entries: [entryRow(makeEntry("fp1", "s1", 0))],
      field_defs: [{ id: "d1", workspace_id: "ws1", key: "k", label: "L", description: "", sort_order: 0, scope: "meditation", cell_type: "text", ref_kind: null, type_id: null, revision: 0, updated_at: null, archived_at: null, deleted_at: null }],
      field_options: [],
      field_values: [
        { entity_id: "fp1", field_def_id: "d1", text: "v", revision: 0, updated_at: null, deleted_at: null },
        { entity_id: "nobody", field_def_id: "d1", text: "other", revision: 0, updated_at: null, deleted_at: null },
      ],
      binaural_presets: [presetRow(makePreset())],
      media_assets: [],
      meditation_types: [],
      intentions: [],
    });

    const library = await port.loadCompileLibrary("ws1");

    expect(library.meditations.map((row) => row.id)).toEqual(["fp1"]);
    expect(library.fieldDefs.map((row) => row.id)).toEqual(["d1"]);
    expect(library.presets).toHaveLength(1);
    // A value hangs off any entity, so the read is scoped to the entities this
    // library actually holds — a value belonging to nobody is not part of it.
    expect(library.fieldValues.map((row) => row.entityId)).toEqual(["fp1"]);
  });

  it("saves an option and a field definition through their own tables", async () => {
    const { port, rows } = harness();
    await port.saveFieldDef(makeFieldDef({ id: "d1" }));
    await port.saveFieldOption(makeFieldOption({ id: "o1", fieldDefId: "d1" }));

    expect(rows("field_defs")).toHaveLength(1);
    expect(rows("field_defs")[0]!.cell_type).toBeDefined();
    expect(rows("field_options")).toHaveLength(1);
    expect(rows("field_options")[0]!.field_def_id).toBe("d1");
  });
});
