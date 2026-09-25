import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ChakraGlyph,
  SymbolGlyph,
  hasDesignedSymbol,
  petalsFor,
} from "../../../apps/web/src/features/runner/focus-glyphs.tsx";

/**
 * The Focus stage's glyphs (the owner's round 20, item 5).
 *
 * What is testable without a browser is the **choice**: which centre a name is, how many
 * petals it has, which symbols have a shape of their own, and which of them falls back. The
 * drawing itself is the e2e's business — it asserts the region paints a chakra glyph and the
 * block's symbols, in the right number.
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
});
