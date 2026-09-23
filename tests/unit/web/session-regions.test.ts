import { describe, expect, it } from "vitest";

import {
  drawnRegions,
  factsHaveValues,
  sessionLayout,
  sessionRegions,
} from "../../../apps/web/src/features/runner/session-regions.ts";
import type { CompiledFact, CompiledSymbolGroup } from "@meditaur/domain";

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
    // rail and the strip do not move when a block walks from one stage to the next.
    const regions = sessionRegions({ symbolGroups: [group("Halu")], stageKind: "symbols" });
    expect(regions.map((region) => region.id)).toEqual(["meditation", "symbol", "symbols"]);
    expect(drawnRegions(regions).map((region) => region.slot)).toEqual(["rail", "main"]);
    // Every other kind keeps the intentions.
    for (const kind of ["intentions", "affirmations", "focus", null] as const) {
      expect(sessionRegions({ stageKind: kind }).at(-1)?.id).toBe("intentions");
    }
  });
});
