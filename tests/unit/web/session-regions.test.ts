import { describe, expect, it } from "vitest";

import {
  drawnRegions,
  factsHaveValues,
  railSubject,
  ringPositions,
  sessionLayout,
  sessionRegions,
} from "../../../apps/web/src/features/runner/session-regions.ts";
import type { CompiledFact, CompiledSymbolGroup } from "@meditaur/domain";

/**
 * Where the focus stage's ring puts its symbols (the owner's round 26).
 *
 * The owner: *"For the Focus stage, I want all the symbols in a circle (without any boxes like
 * they are today), all of the same size, all of them breathing"* — with the meditation *"at the
 * centre of the circle"*. These are the two properties that make it a ring rather than a pile: the
 * first symbol at the top and the rest evenly spaced, and no two symbols sharing a seat.
 */
describe("ringPositions", () => {
  it("puts the first symbol at the top and the rest evenly round", () => {
    const four = ringPositions(4);
    // Top, right, bottom, left — clockwise from the top, on a 40% radius. Rounded, because a
    // sin of a quarter turn is 1 and a float: what matters is the seat, not the last bit.
    const seat = (index: number) => ({
      x: Math.round(four[index]!.x),
      y: Math.round(four[index]!.y),
    });
    expect(seat(0)).toEqual({ x: 50, y: 10 });
    expect(seat(1)).toEqual({ x: 90, y: 50 });
    expect(seat(2)).toEqual({ x: 50, y: 90 });
    expect(seat(3)).toEqual({ x: 10, y: 50 });
    // One symbol sits above the centre rather than on it: the centre is the meditation's.
    expect(ringPositions(1).map((spot) => ({ x: Math.round(spot.x), y: Math.round(spot.y) }))).toEqual(
      [{ x: 50, y: 10 }],
    );
    expect(ringPositions(0)).toEqual([]);
  });

  it("gives every symbol a seat of its own, and always as far from the centre", () => {
    for (let count = 1; count <= 12; count += 1) {
      const spots = ringPositions(count);
      expect(spots).toHaveLength(count);
      expect(
        new Set(spots.map((spot) => `${spot.x.toFixed(3)},${spot.y.toFixed(3)}`)).size,
        `${count} symbols share no seat`,
      ).toBe(count);
      for (const spot of spots) {
        expect(Math.round(Math.hypot(spot.x - 50, spot.y - 50)), `${count} on the ring`).toBe(40);
      }
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

/**
 * What the rail holds (the owner's round 26, item 11).
 *
 * The owner: *"if it is a chakra-only intention, the side-panel should display the details of the
 * chakra. If it is a symbol-only intention display the details of the symbol in the side-panel
 * (most probably, this will be true for the master symbol or the usui symbols. As the Karuna
 * symbols are all tied to the chakra/symbol pair, for which case the view is correct today)."* So
 * the subject follows where the lines hang, and a block with nothing to show answers `null` rather
 * than drawing the empty box round 16 deleted.
 */
describe("railSubject", () => {
  it("holds the symbol in play, and clamps an index past the end", () => {
    const groups = [group("Halu"), group("Gnosa")];
    expect(railSubject({ symbolGroups: groups })?.name).toBe("Halu");
    expect(railSubject({ symbolGroups: groups, groupIndex: 1 })?.name).toBe("Gnosa");
    // A clock can name a group the block no longer has — the rail must not blank.
    expect(railSubject({ symbolGroups: groups, groupIndex: 9 })?.name).toBe("Gnosa");
    expect(railSubject({ symbolGroups: groups, groupIndex: -3 })?.name).toBe("Halu");
    expect(railSubject({ symbolGroups: groups })?.kind).toBe("symbol");
  });

  it("carries the symbol's own columns and the pair's, which is what the panel drew before", () => {
    const a = group("Halu");
    const subject = railSubject({
      symbolGroups: [
        { ...a, facts: [fact("Master")], entryFacts: [{ ...fact("8 minutes"), key: "duration" }] },
      ],
    });
    expect(subject?.facts.map((f) => f.value)).toEqual(["Master", "8 minutes"]);
  });

  it("holds the meditation when the block's lines are its own", () => {
    expect(
      railSubject({
        symbolGroups: [],
        meditationName: "Third-Eye Chakra",
        representationAssetId: "asset-1",
        meditationFacts: [fact("Between the brows")],
      }),
    ).toEqual({
      kind: "meditation",
      name: "Third-Eye Chakra",
      imageAssetId: "asset-1",
      facts: [fact("Between the brows")],
    });
    // Its picture alone is a detail, so a chakra with none of its columns filled in still gets
    // its panel — and with the name the panel does **not** repeat as a heading.
    const pictureOnly = railSubject({ symbolGroups: [], representationAssetId: "asset-1" });
    expect(pictureOnly?.kind).toBe("meditation");
    expect(pictureOnly?.facts).toEqual([]);
  });

  it("answers nothing when there is neither a symbol nor a detail of the meditation", () => {
    expect(railSubject({ symbolGroups: [], meditationFacts: [fact("")] })).toBeNull();
    expect(railSubject({ symbolGroups: [group("Halu")], meditationFacts: [fact("x")] })?.kind).toBe(
      "symbol",
    );
    expect(railSubject({})).toBeNull();
  });
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

  it("spans the strip across the screen where the rail cannot hold the meditation", () => {
    // A points block draws no rail on any stage, so the meditation's columns are the strip's to
    // carry and it spans both columns. (On a block of **one** they are the rail's instead — see
    // the chakra-only case below, which is what round 26's item 11 moved.)
    const points = drawnRegions(
      sessionRegions({ meditationFacts: [fact("Root")], meditationCount: 3 }),
    );
    expect(points.map((region) => region.id)).toEqual(["meditation", "intentions"]);
    expect(sessionLayout(points).areas).toEqual(["top", "main"]);
    expect(sessionLayout(points).columns).toBe("minmax(0, 1fr)");

    // A focus stage is the other one: the ring takes the width, the rail stands aside, and the
    // strip keeps its row.
    const focus = drawnRegions(
      sessionRegions({
        meditationFacts: [fact("Root")],
        symbolGroups: [group("Halu")],
        stageKind: "focus",
      }),
    );
    expect(focus.map((region) => region.id)).toEqual(["meditation", "focus"]);
    expect(sessionLayout(focus).areas).toEqual(["top", "main"]);
  });

  it("holds the chakra in the rail, and stands the strip down for it", () => {
    // The owner's round 26, item 11, on a block whose lines are the chakra's own. The rail is
    // drawn — it was not before — and the strip is not, because the rail carries those same
    // columns: a fact has one home on this screen and the panel is the one the owner asked for.
    const chakraOnly = sessionRegions({
      symbolGroups: [],
      meditationFacts: [fact("Between the brows")],
      meditationName: "Third-Eye Chakra",
      representationAssetId: "asset-1",
    });
    expect(drawnRegions(chakraOnly).map((region) => region.id)).toEqual(["symbol", "intentions"]);
    expect(chakraOnly.find((region) => region.id === "meditation")?.skip).toMatch(
      /rail holds the meditation/,
    );
    // One row, no strip: the rail and the intentions are full height.
    expect(sessionLayout(drawnRegions(chakraOnly)).areas).toEqual(["rail main"]);

    // A focus stage still has no rail, so the columns are the strip's again — the rail's subject
    // follows the shape of the block, and this block's stage takes the whole width.
    const focus = sessionRegions({
      symbolGroups: [],
      meditationFacts: [fact("Between the brows")],
      representationAssetId: "asset-1",
      stageKind: "focus",
    });
    expect(drawnRegions(focus).map((region) => region.id)).toEqual(["meditation", "focus"]);

    // And a points block still has no rail at all, which is round 26's other half.
    const points = sessionRegions({
      symbolGroups: [],
      meditationFacts: [fact("Between the brows")],
      representationAssetId: "asset-1",
      meditationCount: 3,
    });
    expect(drawnRegions(points).map((region) => region.id)).toEqual(["meditation", "intentions"]);
    expect(points.find((region) => region.id === "symbol")?.skip).toMatch(/points block/);
  });

  it("always draws the intentions", () => {
    // The one region that is never skippable: a stage with no lines still has to
    // say so, and it is the region the screen exists for.
    const regions = sessionRegions({});
    expect(regions.map((region) => region.id)).toEqual(["meditation", "symbol", "intentions"]);
    expect(regions.at(-1)?.skip).toBeNull();
  });

  it("shows the symbols as the stage's content, and keeps the rail that names the one in play", () => {
    // The owner's round 17, item 4: a `symbols` stage shows the block's symbols
    // *"in the main region only instead of the intentions"*. The main slot is the
    // same slot either way — it is the region's **content** that changes — so the
    // other regions do not move when a block walks from one stage to the next.
    const regions = sessionRegions({ symbolGroups: [group("Halu")], stageKind: "symbols" });
    expect(regions.map((region) => region.id)).toEqual(["meditation", "symbol", "symbols"]);
    // …and round 26 keeps the rail there, which round 20 had removed: the stage draws the
    // pictures, and the rail **names** the one the clock has reached — the owner's *"the focus
    // stage has a side-panel, so it will be retained and utilized to properly stay in step with
    // the big symbol"*.
    expect(drawnRegions(regions).map((region) => region.slot)).toEqual(["rail", "main"]);

    // A `focus` stage is the third answer: the main slot holds the ring, and the rail goes —
    // *"The focus stage won't need any side-panels now, only all the symbols breathing, same
    // size, big enough to look beautiful."*
    const focus = sessionRegions({ symbolGroups: [group("Halu")], stageKind: "focus" });
    expect(focus.at(-1)?.id).toBe("focus");
    expect(focus.at(-1)?.skip).toBeNull();
    expect(focus.find((region) => region.id === "symbol")?.skip).toMatch(/ring/);
    expect(drawnRegions(focus).map((region) => region.slot)).toEqual(["main"]);

    // Every other kind keeps the intentions, rail and all.
    for (const kind of ["intentions", "affirmations", null] as const) {
      expect(sessionRegions({ stageKind: kind }).at(-1)?.id).toBe("intentions");
    }
  });

  it("draws no rail at all for a block of several points", () => {
    // The owner's round 26, on a points block: *"a column on the left where each cell tells which
    // point these set of intentions are for. You can remove the symbol side-panel for points."* —
    // and, on its symbol stage, *"the side-panel in the symbol stage can be removed, it should be
    // replaced with the focus style display (like the chakras)"*.
    for (const stageKind of [null, "intentions", "affirmations", "symbols", "focus"] as const) {
      const regions = sessionRegions({
        symbolGroups: [group("Halu"), group("Gnosa")],
        stageKind,
        meditationCount: 3,
      });
      expect(regions.find((region) => region.id === "symbol")?.skip, `${stageKind}`).toMatch(
        /points block/,
      );
      expect(drawnRegions(regions).some((region) => region.slot === "rail")).toBe(false);
    }
  });
});
