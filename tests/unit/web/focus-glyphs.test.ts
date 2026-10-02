import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ChakraGlyph,
  SymbolGlyph,
  hasDesignedSymbol,
  petalsFor,
} from "../../../apps/web/src/features/runner/focus-glyphs.tsx";
import {
  ART_VIEW_BOX,
  SYMBOL_ART,
} from "../../../apps/web/src/features/runner/symbol-art.ts";

/**
 * The Focus stage's glyphs (the owner's round 20, item 5), and the two symbols the owner
 * drew by hand (2026-09-25, `P3 · 59`).
 *
 * What is testable without a browser is the **choice**: which centre a name is, how many
 * petals it has, which symbols have a shape of their own, which of them falls back — and,
 * for the imported art, that it arrived as a shape in the region's colour rather than as the
 * black it was exported in. The drawing itself is the e2e's business — it asserts the region
 * paints a chakra glyph and the block's symbols, in the right number.
 *
 * The petal counts are the point of the file: they are the one thing that tells the seven
 * centres apart at a glance, so a name that loses its count is a picture that stops meaning
 * anything.
 */
describe("the Focus stage's glyphs", () => {
  it("gives every chakra the petal count the tradition draws it with", () => {
    expect(petalsFor("Third-Eye Chakra")).toBe(2);
    expect(petalsFor("Root Chakra")).toBe(4);
    expect(petalsFor("Hara Chakra")).toBe(6);
    expect(petalsFor("Solar Plexus")).toBe(10);
    expect(petalsFor("Heart Chakra")).toBe(12);
    expect(petalsFor("Throat Chakra")).toBe(16);
    // The Crown is a bloom rather than the thousand petals the tradition names: a picture
    // of a thousand petals is a smudge.
    expect(petalsFor("Crown Chakra")).toBe(24);
  });

  it("reads a name the way the rest of the app does", () => {
    // Case, spacing and the word `chakra` are not part of a name anywhere else, so they
    // are not part of it here: `FOCUS_ORDER`'s own rule.
    expect(petalsFor("  root   CHAKRA ")).toBe(4);
    expect(petalsFor("Root")).toBe(4);
    expect(petalsFor("heart chakra")).toBe(12);
    // The Sanskrit names are not in `FOCUS_ORDER` and are not a chakra here either: this
    // file answers about the catalogue's names, which is what a block carries.
    expect(petalsFor("Muladhara")).toBe(0);
  });

  it("draws a place, not a centre, for everything that is not one of the seven", () => {
    // A point: `Liver` is a place on the body, so it gets the location mark rather than a
    // borrowed chakra's petals. The same is true of a custom meditation, and of a block
    // whose meditation has been deleted.
    expect(petalsFor("Liver")).toBe(0);
    expect(petalsFor("Thighs")).toBe(0);
    expect(petalsFor("Notes on my own")).toBe(0);
    expect(petalsFor(null)).toBe(0);
    expect(petalsFor(undefined)).toBe(0);
  });

  it("knows the four symbols that have a shape of their own", () => {
    // The four the owner asked to have planted on every chakra and point (round 21), which
    // is why they are the ones a reader meets in a circuit.
    expect(hasDesignedSymbol("Cho Ku Rei")).toBe(true);
    expect(hasDesignedSymbol("Sei Hei Ki")).toBe(true);
    expect(hasDesignedSymbol("Hon Sha Ze Sho Nen")).toBe(true);
    expect(hasDesignedSymbol("Dai Kyo Mo")).toBe(true);
    expect(hasDesignedSymbol(" cho ku rei ")).toBe(true);
    // The Karuna rows the app shipped, and a reader's own symbol, are drawn as a rosette.
    expect(hasDesignedSymbol("Halu")).toBe(false);
    expect(hasDesignedSymbol("My Own Symbol")).toBe(false);
    expect(hasDesignedSymbol(null)).toBe(false);
  });

  it("draws in the colour it inherits, and in no colour of its own", () => {
    // The accent is decided by the region that holds a glyph, so no glyph may carry a
    // colour of its own: `currentColor` is what lets one meditation's hue paint every
    // picture on the stage. The petals are the other half of the same idea — a centre's
    // drawing has as many as the centre does, which is the one thing that tells the seven
    // apart at a glance, and a place on the body has none.
    // A lotus is one path of quadratic petals (`scallop`), so the count is the number of
    // curves in it — the ellipses this used to count were the first cut's, and a reader
    // could not tell four of them from a circle.
    const petals = (svg: string) => (svg.match(/Q/g) ?? []).length;
    const draws = (name: string) => renderToStaticMarkup(ChakraGlyph({ name, className: "h-4" }));
    // `stroke-current` is Tailwind's `stroke: currentColor`, and `fill-none` keeps every
    // glyph a line drawing: the pair is what "drawn in the accent" means in the markup.
    for (const name of ["Root Chakra", "Third-Eye Chakra", "Liver"]) {
      const svg = draws(name);
      expect(svg, name).toContain("<svg");
      expect(svg, name).toContain("stroke-current");
      expect(svg, name).toContain("fill-none");
      expect(svg, name).not.toMatch(/#[0-9a-f]{6}/i);
    }
    for (const name of ["Cho Ku Rei", "Halu"]) {
      const svg = renderToStaticMarkup(SymbolGlyph({ name, className: "h-4" }));
      expect(svg, name).toContain("stroke-current");
      expect(svg, name).not.toMatch(/#[0-9a-f]{6}/i);
    }
    expect(petals(draws("Third-Eye Chakra"))).toBe(2);
    expect(petals(draws("Root Chakra"))).toBe(4);
    expect(petals(draws("Crown Chakra"))).toBe(24);
    expect(petals(draws("Liver")), "a place is a location mark, not a bloom").toBe(0);
  });

  it("reaches the owner's art through the same name the catalogue carries", () => {
    // The art is keyed by the name the owner drew under, and read through `keyOf` like every
    // other name here — so the hyphenated, spaced and shouted spellings all find it, and the
    // handover's own file name (`HSZSN`) is not what the app has to match.
    expect(hasDesignedSymbol("Dai Kyo Mo")).toBe(true);
    expect(hasDesignedSymbol("hon sha ze sho nen")).toBe(true);
    expect(hasDesignedSymbol(" hon-sha-ze-sho-nen ")).toBe(true);
    expect(renderToStaticMarkup(SymbolGlyph({ name: "Hon-Sha-Ze-Sho-Nen", className: "h-4" }))).toContain(
      "fill=\"currentColor\"",
    );
  });

  it("paints the owner's art in the region's colour, never in the export's", () => {
    // The exports carry `fill="#000000"` on every path — the brush strokes are black, which is
    // invisible on a session screen. This is the assertion that fails the moment somebody
    // pastes an export in verbatim, which is exactly how the art arrives next time.
    for (const name of ["Dai Kyo Mo", "Hon Sha Ze Sho Nen"]) {
      const svg = renderToStaticMarkup(SymbolGlyph({ name, className: "h-4" }));
      expect(svg, name).toContain("fill=\"currentColor\"");
      expect(svg, name).toContain("stroke=\"none\"");
      expect(svg, name).not.toMatch(/#[0-9a-f]{6}/i);
      expect(svg, name).not.toContain("<img");
    }
  });

  it("draws the brush art as fills and everything else as line art", () => {
    // Two hands, one ink. A brush stroke leaves Linearity Curve as the outline of the width it
    // swept, so the art has no `stroke-width` in it at all — while every glyph this file draws
    // itself is a stroke and has one. A symbol that quietly changed hand would read as a
    // different drawing on the same screen.
    const brush = renderToStaticMarkup(SymbolGlyph({ name: "Dai Kyo Mo", className: "h-4" }));
    expect(brush).toContain("<path");
    expect(brush).not.toContain("stroke-width");
    for (const name of ["Cho Ku Rei", "Sei Hei Ki", "Halu", null]) {
      const line = renderToStaticMarkup(SymbolGlyph({ name, className: "h-4" }));
      expect(line, String(name)).toContain("stroke-width=\"2.5\"");
      expect(line, String(name)).not.toContain("fill=\"currentColor\"");
    }
  });

  it("holds a square frame, one path per stroke, in the order they were drawn", () => {
    // The frame is square and both exports are square, so nothing is letterboxed and no art
    // has to be re-framed to fit. One entry per brush stroke, in the drawing's own order: that
    // order is the only thing a line-drawing reveal can walk (`P3 · 59`), so it is data here.
    expect(ART_VIEW_BOX).toMatch(/^0 0 (\d+) \1$/);
    expect(Object.keys(SYMBOL_ART)).toEqual(["Dai Kyo Mo", "Hon Sha Ze Sho Nen"]);
    for (const [name, paths] of Object.entries(SYMBOL_ART)) {
      expect(paths.length, name).toBeGreaterThan(3);
      for (const d of paths) {
        expect(d, name).toMatch(/^M/);
        expect(d, name).toMatch(/Z$/);
        // Path data only: no markup, no colour, nothing a `d` attribute cannot hold.
        expect(d, name).not.toMatch(/[<>"]/);
        expect(d, name).not.toMatch(/#/);
      }
    }
  });
});
