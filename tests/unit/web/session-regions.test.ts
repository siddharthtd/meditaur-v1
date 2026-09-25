import { describe, expect, it } from "vitest";

import {
  drawnRegions,
  factsHaveValues,
  sessionLayout,
  sessionRegions,
  symbolRows,
} from "../../../apps/web/src/features/runner/session-regions.ts";
import type { CompiledFact, CompiledSymbolGroup } from "@meditaur/domain";

/**
 * How the symbol boxes are arranged (the owner's round 22).
 *
 * The owner, on the sheet round 20 built: *"they still need to follow an organized grid
 * structure, but, something like hexagonal shape for 6 intentions in Heart, or if there are 5
 * then 3 in first row 2 in the 2nd row in the middle."* These are the counts a chakra, a
 * point and a Protection block actually produce, plus the ends of the range.
 */
describe("symbolRows", () => {
  it("gives the owner's own examples", () => {
    // 6 → 3 + 3, 5 → 3 + 2 with the short row underneath.
    expect(symbolRows(6)).toEqual([3, 3]);
    expect(symbolRows(5)).toEqual([3, 2]);
    // The ends: one, two and three boxes are one row; seven puts the extra in the middle.
    expect(symbolRows(1)).toEqual([1]);
    expect(symbolRows(2)).toEqual([2]);
    expect(symbolRows(3)).toEqual([3]);
    expect(symbolRows(4)).toEqual([2, 2]);
    expect(symbolRows(7)).toEqual([2, 3, 2]);
    // Nothing to arrange at all.
    expect(symbolRows(0)).toEqual([]);
  });

  it("never loses a box, and never puts more than three in a row", () => {
    for (let count = 0; count <= 30; count += 1) {
      const rows = symbolRows(count);
      expect(rows.reduce((total, width) => total + width, 0), `${count} boxes`).toBe(count);
      expect(Math.max(0, ...rows), `${count} in a row`).toBeLessThanOrEqual(3);
      // A row of nothing is a gap in the shape, and the shape is the point.
      expect(rows.every((width) => width > 0), `${count} has no empty row`).toBe(true);
    }
  });
});

/**
 * The session screen's arrangement (the owner's round 16, items 4, 8 and 9).
 *
 * The whole point of the region list is that a region with nothing to say **frees
 * its slot**: the intentions take the width a rail would have used, and the screen
 * starts at the top when there is no strip. These are the four arrangements that
 * produces, and the reason each region is skipped.
 */
const fact = (value: string): CompiledFact => ({
  key: "location",
  label: "Location",
  value,
  pinned: false,
});

const group = (name: string): CompiledSymbolGroup => ({
  name,
  description: "",
  usage: "",
  imageAssetId: null,
  facts: [],
  entryFacts: [],
  intentions: [],
});

describe("the session screen's regions", () => {
  it("counts a blank value as nothing, and a value as something", () => {
    expect(factsHaveValues([])).toBe(false);
    expect(factsHaveValues([fact("")])).toBe(false);
    expect(factsHaveValues([fact("   ")])).toBe(false);
    expect(factsHaveValues([fact(""), fact("Heart")])).toBe(true);
    // A region that is not drawn has nothing to read: `undefined` is the shape a
    // block compiled before this round has.
    expect(factsHaveValues(undefined)).toBe(false);
  });

  it("gives the intentions everything when there is nothing else to show", () => {
    // The owner's report was a chakra whose box said nothing (`item 0`), and the
    // rule they wanted for it (`item 9`): no data, no box.
    const regions = sessionRegions({ meditationFacts: [fact("")], symbolGroups: [] });
    const drawn = drawnRegions(regions);
    expect(drawn.map((region) => region.id)).toEqual(["intentions"]);
    expect(regions.find((r) => r.id === "meditation")?.skip).toMatch(/no meditation column/);
    expect(regions.find((r) => r.id === "symbol")?.skip).toMatch(/no symbols/);
    expect(sessionLayout(drawn)).toEqual({
      areas: ["main"],
      columns: "minmax(0, 1fr)",
      rows: "minmax(0, 1fr)",
    });
  });

  it("keeps the symbol rail only when the block has symbols", () => {
    const drawn = drawnRegions(sessionRegions({ symbolGroups: [group("Halu")] }));
    expect(drawn.map((region) => region.id)).toEqual(["symbol", "intentions"]);
    const layout = sessionLayout(drawn);
    expect(layout.areas).toEqual(["rail main"]);
    expect(layout.columns).toBe("minmax(10rem, 14rem) minmax(0, 1fr)");
    // One row only, so the rail and the intentions are full height.
    expect(layout.rows).toBe("minmax(0, 1fr)");
  });

  it("puts the meditation's columns in a strip that costs height, not width", () => {
    const drawn = drawnRegions(
      sessionRegions({ meditationFacts: [fact("Between the brows")], symbolGroups: [group("Halu")] }),
    );
    expect(drawn.map((region) => region.id)).toEqual(["meditation", "symbol", "intentions"]);
    const layout = sessionLayout(drawn);
    // `top top`: the strip spans both columns, so the rail's width is not taken
    // from it and the intentions still get the rest.
    expect(layout.areas).toEqual(["top top", "rail main"]);
    expect(layout.rows).toBe("auto minmax(0, 1fr)");
  });

  it("still spans the strip when there is no rail", () => {
    const drawn = drawnRegions(sessionRegions({ meditationFacts: [fact("Root")] }));
    expect(sessionLayout(drawn).areas).toEqual(["top", "main"]);
    expect(sessionLayout(drawn).columns).toBe("minmax(0, 1fr)");
  });

  it("always draws the intentions", () => {
    // The one region that is never skippable: a stage with no lines still has to
    // say so, and it is the region the screen exists for.
    const regions = sessionRegions({});
    expect(regions.map((region) => region.id)).toEqual(["meditation", "symbol", "intentions"]);
    expect(regions.at(-1)?.skip).toBeNull();
  });

  it("is the symbols region when the stage on screen shows symbols", () => {
    // The owner's round 17, item 4: a `symbols` stage shows the block's symbols
    // *"in the main region only instead of the intentions"*. The main slot is the
    // same slot either way — it is the region's **content** that changes — so the
    // other regions do not move when a block walks from one stage to the next.
    const regions = sessionRegions({ symbolGroups: [group("Halu")], stageKind: "symbols" });
    expect(regions.map((region) => region.id)).toEqual(["meditation", "symbol", "symbols"]);
    // …but the rail is **not** drawn there (the owner's round 20: *"I don't want a
    // rail or a strip of bigger symbols, I want individual scattered (yet arranged)
    // boxes … on the screen"*). The sheet draws every symbol, so the panel beside it
    // was the same information twice and half the width to say it in.
    expect(regions.find((region) => region.id === "symbol")?.skip).toMatch(/every symbol/);
    expect(drawnRegions(regions).map((region) => region.slot)).toEqual(["main"]);

    // A `focus` stage is the third answer: the main slot, held, with nothing drawn
    // in it yet — what fills it is `P2 · 39`'s chakra and symbol visuals.
    const focus = sessionRegions({ symbolGroups: [group("Halu")], stageKind: "focus" });
    expect(focus.at(-1)?.id).toBe("focus");
    expect(focus.at(-1)?.skip).toBeNull();

    // Every other kind keeps the intentions, rail and all.
    for (const kind of ["intentions", "affirmations", null] as const) {
      expect(sessionRegions({ stageKind: kind }).at(-1)?.id).toBe("intentions");
    }
  });
});
