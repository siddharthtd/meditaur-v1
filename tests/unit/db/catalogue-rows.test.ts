import { describe, expect, it } from "vitest";
import { makeEntry, makeIntention, makeSymbol } from "../../fixtures/library.ts";
import {
  entryFromRow,
  entryRow,
  intentionFromRow,
  intentionRow,
  symbolFromRow,
  symbolRow,
} from "../../../packages/db/src/catalogue-rows.ts";

describe("the catalogue rows", () => {
  it("writes a symbol's stored names, and keeps 'no system' as null", () => {
    // The names are the contract, and a fake that spoke the domain's would prove
    // nothing about the table — the same reason the meditations pair has this case.
    const row = symbolRow(makeSymbol("s1", "Lam", { reikiSystem: undefined }));
    expect(Object.keys(row)).toContain("image_asset_id");
    expect(Object.keys(row)).toContain("reiki_system");
    expect(Object.keys(row)).not.toContain("imageAssetId");

    // Absent is a real state: a reader's own symbol belongs to no system, and a
    // default written here would quietly place it in one. (The fixture stamps a
    // system on a symbol it mints, which is why this case unsets it: what is being
    // tested is the absence, not the fixture's default.)
    expect(row.reiki_system).toBeNull();
    expect(symbolFromRow(row).reikiSystem).toBeUndefined();
  });

  it("round-trips a symbol, timestamps and all", () => {
    const symbol = makeSymbol("s1", "Lam", {
      imageAssetId: "rain1",
      archivedAt: 1_700_000_000_000,
      deletedAt: 1_700_000_100_000,
    });
    expect(symbolFromRow(symbolRow(symbol))).toEqual(symbol);
  });

  it("keeps half a reference as half a reference", () => {
    // A symbol-only row is a real row, not a broken pair: both sides default to
    // `null` rather than to each other.
    const entry = makeEntry(null, "s1", 0, {
      id: "e1",
      archivedAt: null,
      deletedAt: null,
    });
    const read = entryFromRow(entryRow(entry));
    expect(read.meditationId).toBeNull();
    expect(read.symbolId).toBe("s1");
    expect(read).toEqual(entry);
  });

  it("keeps a sentence with no row as the orphan it is", () => {
    // `entryId: null` is the state the Affirmations tab draws, so a mapper that
    // filled it in would move a sentence somewhere the reader never put it.
    const line = makeIntention("or1", "I am calm", {
      entryId: null,
      archivedAt: null,
      deletedAt: null,
    });
    const read = intentionFromRow(intentionRow(line));
    expect(read.entryId).toBeNull();
    expect(read.text).toBe("I am calm");
    expect(read).toEqual(line);
  });

  it("reads a row older than its columns as live and empty", () => {
    const row = symbolRow(makeSymbol("s1", "Lam"));
    delete row.description;
    delete row.usage;
    delete row.archived_at;
    delete row.deleted_at;

    const read = symbolFromRow(row);
    expect(read.description).toBe("");
    expect(read.usage).toBe("");
    expect(read.archivedAt).toBeNull();
    expect(read.deletedAt).toBeNull();
  });
});
