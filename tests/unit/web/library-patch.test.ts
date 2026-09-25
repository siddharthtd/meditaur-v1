import { describe, expect, it } from "vitest";
import { noDatabaseRows, type CatalogChangeSet, type LibraryView } from "@meditaur/application";
import type { MediaAsset } from "@meditaur/domain";
import { patchLibrary, withRow } from "../../../apps/web/src/features/library/library-patch.ts";
import {
  NEW_ROW_VERSION,
  makeMeditation,
  makePlan,
  makeBlock,
  makePreset,
  makeSymbol,
} from "../../fixtures/library.ts";

/**
 * The Library's lists, patched from the answer a write gives (`P2 · 4`).
 *
 * The screens have no rendering tests, so what is proved here is the merge itself:
 * that a delete drops exactly the row that went, that the rows a cascade rewrote
 * arrive with their new values, that a row the cascade left alone is passed through
 * untouched, and that a new row lands at its own order rather than at the end.
 */
function emptyView(extra: Partial<LibraryView> = {}): LibraryView {
  return {
    meditationTypes: [],
    meditations: [],
    symbols: [],
    intentions: [],
    entries: [],
    fieldDefs: [],
    fieldOptions: [],
    fieldValues: [],
    presets: [],
    mediaAssets: [],
    plans: [],
    logs: [],
    sessionsThisWeek: 0,
    ...extra,
  };
}

function noChange(): CatalogChangeSet {
  return {
    removed: {
      presets: [],
      mediaAssets: [],
      symbols: [],
      entries: [],
      intentions: [],
      meditations: [],
      meditationTypes: [],
    },
    updated: { meditations: [], symbols: [], plans: [], presets: [], ...noDatabaseRows() },
  };
}

function asset(id: string, name: string, sortOrder: number): MediaAsset {
  return {
    ...NEW_ROW_VERSION,
    id,
    workspaceId: "ws1",
    kind: "ambient",
    name,
    storagePath: id,
    durationMs: 0,
    sortOrder,
  };
}

describe("patchLibrary", () => {
  it("drops the row that went and leaves the rest of the list alone", () => {
    const presets = [
      makePreset({ id: "p1", sortOrder: 0 }),
      makePreset({ id: "p2", sortOrder: 1 }),
      makePreset({ id: "p3", sortOrder: 2 }),
    ];
    const patched = patchLibrary(emptyView({ presets }), {
      ...noChange(),
      // Spread rather than spelled out, so a bucket this test does not care about
      // can grow without turning every case into a compile error.
      removed: { ...noChange().removed, presets: ["p2"] },
    });
    expect(patched.presets.map((row) => row.id)).toEqual(["p1", "p3"]);
    // The rows that stayed are the objects the view already held: a patch cannot
    // renumber or refresh a row the store did not touch.
    expect(patched.presets[1]).toBe(presets[2]);
  });

  it("takes the rows a cascade rewrote and passes the untouched ones through", () => {
    const cleared = makeMeditation("m1", "Root", {
      defaultBinauralPresetId: null,
      revision: 1,
    });
    const untouchedMeditation = makeMeditation("m2", "Heart");
    const untouchedSymbol = makeSymbol("s1", "Lam");
    const view = emptyView({
      meditations: [makeMeditation("m1", "Root", { defaultBinauralPresetId: "p1" }), untouchedMeditation],
      symbols: [untouchedSymbol],
    });

    const patched = patchLibrary(view, {
      ...noChange(),
      updated: { meditations: [cleared], symbols: [], plans: [], presets: [], ...noDatabaseRows() },
    });
    expect(patched.meditations[0]!.defaultBinauralPresetId).toBeNull();
    expect(patched.meditations[0]!.revision).toBe(1);
    expect(patched.meditations[1]).toBe(untouchedMeditation);
    expect(patched.symbols).toBe(view.symbols);
  });

  it("leaves the plan list alone, because a cascade renames nothing", () => {
    // The view holds each plan's id and name; `patchPlanBlocks` clears a block's
    // reference and changes neither, so the whole plan the change-set carries is
    // for the planner rather than for here.
    const plans = [{ id: "plan1", name: "Morning" }];
    const patched = patchLibrary(emptyView({ plans }), {
      ...noChange(),
      updated: {
        meditations: [],
        symbols: [],
        plans: [makePlan([makeBlock("b1", 0)])],
        presets: [],
        ...noDatabaseRows(),
      },
    });
    expect(patched.plans).toBe(plans);
  });
});

describe("withRow", () => {
  it("inserts a new row at its own order, not at the end", () => {
    const rows = [asset("a", "Bell", 1), asset("b", "Rain", 2)];
    expect(withRow(rows, asset("z", "Amber", 0)).map((row) => row.id)).toEqual(["z", "a", "b"]);
    expect(withRow(rows, asset("y", "Zither", 7)).map((row) => row.id)).toEqual(["a", "b", "y"]);
  });

  it("replaces a row it already holds, keeping one row per id", () => {
    const rows = [asset("a", "Bell", 0)];
    const renamed = { ...asset("a", "Bell chime", 0), revision: 2 };
    const patched = withRow(rows, renamed);
    expect(patched).toHaveLength(1);
    expect(patched[0]).toBe(renamed);
  });
});
