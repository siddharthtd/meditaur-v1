import type { CompiledFact, CompiledSymbolGroup, StageKind } from "@meditaur/domain";

/**
 * What the session screen is made of, and where each piece sits.
 *
 * The owner's round 16, item 8: *"if more stuff is added later on … we need a way
 * to dynamically arrange-organize the blocks on the session page automatically"* —
 * so the screen is a list of **regions** rather than three children written into a
 * fixed grid. A region declares which slot it takes and whether it has anything to
 * say; one that does not draw **frees its slot**, which is item 4's *"intentions
 * consume largest space"* and item 9's *"if nothing is displayed, remove that box"*
 * expressed once instead of as three special cases.
 *
 * Adding a region later is a `draw` in `SessionRegions.tsx` and, when a column
 * feeds it, a `PlanDisplayArea` — never a new grid template.
 */

/** Where a region sits. One of each, at most. */
export type SessionSlot = "top" | "rail" | "main";

/**
 * The main region is whichever kind of stage is on screen.
 *
 * The owner's round 17, item 4: a `symbols` stage shows the symbols *"in the main
 * region only instead of the intentions"*. So the region is not "the intentions" —
 * it is **the stage's own content**, and the id is what it happens to be showing.
 */
export type SessionRegionId = "meditation" | "symbol" | "intentions" | "symbols";

export type SessionRegion = {
  id: SessionRegionId;
  slot: SessionSlot;
  /** The plan's `Display` area that feeds it, or `null` for the region that has
   *  no columns of its own. */
  area: "meditation" | "symbol" | null;
  /**
   * Why it is not drawn, or `null` when it is.
   *
   * A sentence rather than a boolean because the reason is the useful part of the
   * decision — it is what `tests/unit/web/session-regions.test.ts` asserts and what
   * a later region's author reads.
   */
  skip: string | null;
};

/**
 * Whether a set of compiled facts says anything.
 *
 * The owner's item 9: a chakra with no values gets **no box**, not a box of dashes.
 * A fact whose value is blank counts as nothing, because the panel's job is to show
 * the meditation's columns and a blank one is the absence of the value the reader
 * pinned it for. A `-` is drawn inside a region that has *something*; it is never a
 * reason to draw the region.
 */
export function factsHaveValues(facts: CompiledFact[] | undefined): boolean {
  return (facts ?? []).some((fact) => fact.value.trim().length > 0);
}

/**
 * The regions the session screen draws, in order top to bottom.
 *
 * `skip` is computed here rather than inside each component so that the whole
 * arrangement is one testable function: the geometry test in the e2e suite measures
 * the screen, and this one says what it should have found.
 *
 * The meditation region carries the meditation's own Display columns and **not** its
 * name or its type: the owner's item 0 pointed out that the name is already the
 * screen's title, so the panel that repeated it was a box with nothing in it. The
 * facts stay — that is the ask round 15 recorded — and they sit in the `top` slot so
 * they cost height rather than the intentions' width.
 */
export function sessionRegions(input: {
  meditationFacts?: CompiledFact[];
  symbolGroups?: CompiledSymbolGroup[];
  /** The kind of the stage on screen, which decides what the main region holds. */
  stageKind?: StageKind | null;
}): SessionRegion[] {
  const groups = input.symbolGroups ?? [];
  // A `symbols` stage shows the block's symbols; every other stage shows the lines
  // it reads. Both take the main slot, so the other two regions do not move when a
  // block walks from one stage to the next.
  const showsSymbols = input.stageKind === "symbols";
  return [
    {
      id: "meditation",
      slot: "top",
      area: "meditation",
      skip: factsHaveValues(input.meditationFacts)
        ? null
        : "the plan shows no meditation column with a value",
    },
    {
      id: "symbol",
      slot: "rail",
      area: "symbol",
      skip: groups.length > 0 ? null : "this meditation has no symbols",
    },
    {
      // Always drawn: the region is the stage's content, and "this stage has
      // nothing for you" is a thing it has to be able to say — the intentions
      // column says it for an empty stage, and the gallery says it for a symbols
      // stage with no symbols.
      id: showsSymbols ? "symbols" : "intentions",
      slot: "main",
      area: null,
      skip: null,
    },
  ];
}

/** The grid a set of drawn regions needs — its areas, its columns, its rows. */
export type SessionLayout = {
  /** Inline `grid-template-areas`, one string per row. */
  areas: string[];
  columns: string;
  rows: string;
};

/** A rail is one thumb's worth of width; everything else goes to the main region. */
const RAIL_COLUMNS = "minmax(10rem, 14rem) minmax(0, 1fr)";
const SOLO_COLUMN = "minmax(0, 1fr)";

/**
 * The template for the regions that are drawn.
 *
 * The *absent* regions are what this is really about: with no rail the intentions
 * take the full width, and with no top strip they start at the top of the screen.
 * Nothing collapses a row to zero or leaves a gap where a region used to be.
 */
export function sessionLayout(drawn: Pick<SessionRegion, "slot">[]): SessionLayout {
  const top = drawn.some((region) => region.slot === "top");
  const rail = drawn.some((region) => region.slot === "rail");
  const areas = top
    ? rail
      ? ["top top", "rail main"]
      : ["top", "main"]
    : rail
      ? ["rail main"]
      : ["main"];
  return {
    areas,
    columns: rail ? RAIL_COLUMNS : SOLO_COLUMN,
    rows: top ? "auto minmax(0, 1fr)" : "minmax(0, 1fr)",
  };
}

/** The drawn regions, in slot order, for the renderer. */
export function drawnRegions(regions: SessionRegion[]): SessionRegion[] {
  return regions.filter((region) => region.skip === null);
}
