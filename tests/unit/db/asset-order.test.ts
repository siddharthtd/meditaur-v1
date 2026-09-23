import { describe, expect, it } from "vitest";
import type { MediaAsset } from "@meditaur/domain";
import { assetsWithOrder, type StoredMediaAsset } from "../../../packages/db/src/asset-order.ts";
import { NEW_ROW_VERSION } from "../../fixtures/library.ts";

/**
 * The rule behind Dexie v26 (`P2 · 4`).
 *
 * A device that holds audio files has rows with no `sortOrder`, and a version that
 * has already run is never re-run — so the numbering is a new version's rule, and
 * the rule is pure because the unit suite has no IndexedDB.
 */
function stored(id: string, name: string, sortOrder?: number): StoredMediaAsset {
  return {
    ...NEW_ROW_VERSION,
    id,
    workspaceId: "ws1",
    kind: "ambient",
    name,
    storagePath: id,
    durationMs: 0,
    ...(sortOrder === undefined ? {} : { sortOrder }),
  };
}

describe("assetsWithOrder", () => {
  it("numbers every unnumbered row by name, then id", () => {
    const rows = assetsWithOrder([
      stored("a", "Bell"),
      stored("b", "Apple"),
      stored("c", "Cherry"),
    ]);
    expect(rows.map((row) => [row.name, row.sortOrder])).toEqual([
      ["Apple", 0],
      ["Bell", 1],
      ["Cherry", 2],
    ]);
  });

  it("breaks a shared name on the id, so two runs agree", () => {
    const rows = assetsWithOrder([stored("z", "Rain"), stored("a", "Rain")]);
    expect(rows.map((row) => [row.id, row.sortOrder])).toEqual([
      ["a", 0],
      ["z", 1],
    ]);
  });

  it("leaves a row that already has an order alone, whatever its name", () => {
    // The order is the app's, and a row the app has placed keeps its place: this
    // version numbers what predates the column, and does nothing else.
    const rows = assetsWithOrder([stored("a", "Zebra", 7), stored("b", "Apple")]);
    expect(rows.map((row) => row.id)).toEqual(["b"]);
    expect(rows[0]!.sortOrder).toBe(0);
  });

  it("is a no-op on a device that is already ordered", () => {
    const numbered: MediaAsset[] = [
      { ...stored("a", "Bell"), sortOrder: 1 },
      { ...stored("b", "Apple"), sortOrder: 0 },
    ];
    expect(assetsWithOrder(numbered)).toEqual([]);
  });
});
