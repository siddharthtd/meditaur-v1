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
 *
 * A `focus` stage draws the meditation's picture and its symbols in one colour and keeps
 * its slot, which is the space that artwork fills — the owner's round 20 asked for the
 * blank region first and for the visuals second, and round 21 built them.
 */
export type SessionRegionId = "meditation" | "symbol" | "intentions" | "symbols" | "focus";

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
 * What the rail beside the lines holds.
 *
 * The owner's round 26, item 11: *"if it is a chakra-only intention, the side-panel should
 * display the details of the chakra. If it is a symbol-only intention display the details of the
 * symbol in the side-panel (most probably, this will be true for the master symbol or the usui
 * symbols. As the Karuna symbols are all tied to the chakra/symbol pair, for which case the view
 * is correct today)."*
 *
 * So the rail holds **what the block is about**, decided by where its lines hang: the symbol in
 * play — the pair a Karuna sentence belongs to, or the symbol a Usui one does — or, where the
 * lines are the meditation's own, the meditation. It is one function rather than a condition
 * inside the component because the arrangement is what `session-regions.test.ts` asserts, and
 * because `sessionRegions` has to ask the same question to know whether the strip is needed.
 *
 * A meditation is rendered as its **picture and its Display columns**, with no name: the name is
 * the screen's own title, which is the reason round 16 removed the panel that repeated it. That
 * is also why the subject is `null` rather than a nameless panel when there is neither a picture
 * nor a column with a value — a box with nothing in it is what that round deleted.
 */
export type RailSubject = {
  kind: "symbol" | "meditation";
  name: string;
  imageAssetId: string | null;
  facts: CompiledFact[];
};

export function railSubject(input: {
  symbolGroups?: CompiledSymbolGroup[];
  /** Which symbol the stage's clock has reached; clamped, so a stale index cannot blank it. */
  groupIndex?: number;
  meditationName?: string | null;
  representationAssetId?: string | null;
  meditationFacts?: CompiledFact[];
}): RailSubject | null {
  const groups = input.symbolGroups ?? [];
  if (groups.length > 0) {
    const index = Math.min(Math.max(input.groupIndex ?? 0, 0), groups.length - 1);
    const group = groups[index]!;
    return {
      kind: "symbol",
      name: group.name,
      imageAssetId: group.imageAssetId,
      facts: [...(group.facts ?? []), ...(group.entryFacts ?? [])],
    };
  }
  if (!factsHaveValues(input.meditationFacts) && !input.representationAssetId) return null;
  return {
    kind: "meditation",
    name: input.meditationName ?? "",
    imageAssetId: input.representationAssetId ?? null,
    facts: input.meditationFacts ?? [],
  };
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
  /**
   * How many meditations the block runs.
   *
   * A block of several is a **points block** (the owner's round 22), and round 26 made it a
   * shape of its own on this screen: it draws no rail on any stage, because what a reader needs
   * beside its table is the *point* a line belongs to rather than the symbol it hangs off — and
   * its symbols are all shown at the symbol and focus stages anyway.
   */
  meditationCount?: number;
  /**
   * The meditation's own name and picture.
   *
   * The rail needs them for the one block shape that has no symbol groups: the owner's round 26,
   * item 11 — *"if it is a chakra-only intention, the side-panel should display the details of
   * the chakra."*
   */
  meditationName?: string | null;
  representationAssetId?: string | null;
}): SessionRegion[] {
  const groups = input.symbolGroups ?? [];
  const many = (input.meditationCount ?? 1) > 1;
  // A `symbols` stage shows the block's symbols; every other stage shows the lines
  // it reads. Both take the main slot, so the other two regions do not move when a
  // block walks from one stage to the next.
  const showsSymbols = input.stageKind === "symbols";
  // The stage the owner moved the artwork to: *"The focus stage's animations are good, so
  // they're going into the symbol stage. … The focus stage won't need any side-panels now, only
  // all the symbols breathing, same size, big enough to look beautiful."*
  const isFocus = input.stageKind === "focus";
  /**
   * What the rail would hold, and therefore whether there is a rail at all.
   *
   * The same `railSubject` the panel renders from — asked with no index, because whether a
   * subject exists does not depend on which symbol the clock has reached. One rule, so the
   * region and the panel cannot disagree about whether there is anything to draw: a block whose
   * lines are the meditation's own gets the meditation, and only a block with neither symbols
   * nor a meditation with a picture or a column to its name gets no rail.
   */
  const railHere =
    many || isFocus
      ? null
      : railSubject({
          symbolGroups: groups,
          meditationName: input.meditationName,
          representationAssetId: input.representationAssetId,
          meditationFacts: input.meditationFacts,
        });
  const railHoldsMeditation = railHere?.kind === "meditation";
  return [
    {
      id: "meditation",
      slot: "top",
      area: "meditation",
      // The strip stands down where the rail holds the meditation, because the rail carries the
      // same columns: a fact has one home on this screen, and the panel is the one the owner
      // asked for (the owner's round 26, item 11).
      skip: railHoldsMeditation
        ? "the rail holds the meditation on a block whose lines are its own"
        : factsHaveValues(input.meditationFacts)
          ? null
          : "the plan shows no meditation column with a value",
    },
    {
      // The rail is **what the block is about** beside the lines, and its details are what makes
      // a session readable at a glance: the symbol in play on a block whose lines hang off
      // symbols, and the meditation itself where they do not. It is kept on a symbols stage too,
      // since round 26: the stage draws the pictures and the rail **names** the one the clock has
      // reached — *"the focus stage has a side-panel, so it will be retained and utilized to
      // properly stay in step with the big symbol"*.
      id: "symbol",
      slot: "rail",
      area: "symbol",
      skip: many
        ? "a points block names its points in the table instead"
        : isFocus
          ? "a focus stage draws every symbol in a ring"
          : railHere !== null
            ? null
            : "this meditation has no symbols",
    },
    {
      // Always drawn: the region is the stage's content, and "this stage has
      // nothing for you" is a thing it has to be able to say — the intentions
      // column says it for an empty stage, and the symbols stage says it for a block
      // with no symbols.
      id: showsSymbols ? "symbols" : isFocus ? "focus" : "intentions",
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

/**
 * Where each symbol sits on the focus stage's ring, as a percentage of the ring's own box.
 *
 * The owner's round 26: *"For the Focus stage, I want all the symbols in a circle (without any
 * boxes like they are today), all of the same size, all of them breathing"* — and, on the
 * meditation, *"at the centre of the circle — the symbols ring the meditation"*.
 *
 * The first symbol sits at the top and the rest follow clockwise, evenly spaced: four symbols
 * make a diamond, eight an octagon, one sits above the centre. Pure arithmetic, so the geometry
 * can be asserted without a browser — the equal **size** of the symbols is the stylesheet's
 * business, and the fact that they do not collide is the radius's.
 */
export function ringPositions(count: number, radiusPercent = 40): { x: number; y: number }[] {
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, index) => {
    const angle = (2 * Math.PI * index) / count;
    return {
      x: 50 + radiusPercent * Math.sin(angle),
      y: 50 - radiusPercent * Math.cos(angle),
    };
  });
}
