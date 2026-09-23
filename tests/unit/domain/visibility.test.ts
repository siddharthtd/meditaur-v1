import { describe, expect, it } from "vitest";
import {
  entryIsVisible,
  isLive,
  lineIsVisible,
  livenessOf,
  visibleEntries,
  visibleEntryIds,
  visibleLines,
} from "@meditaur/domain";
import { makeEntries, makeEntry, makeMeditation, makeLines, makeSymbol } from "../../fixtures/library.ts";

/**
 * The visibility rule (§3.1), which everything else about archiving rests on:
 * *an item is visible only if it and every record it references are live.*
 *
 * It is one sentence, and it is what makes "associations are preserved when
 * archiving" true by construction rather than by bookkeeping.
 */
describe("the visibility rule", () => {
  const meditations = [makeMeditation("fp1", "Root", { sortOrder: 0 })];
  const symbols = [makeSymbol("s1", "Lam")];

  it("hides a row whose chakra is archived, without touching the row", () => {
    const { entries, intentions } = makeEntries([
      { meditationId: "fp1", symbolId: "s1", texts: ["A"] },
      { meditationId: null, symbolId: "s1", texts: ["B"] },
    ]);
    const archived = meditations.map((row) => ({ ...row, archivedAt: 5 }));
    const live = livenessOf({ meditations: archived, symbols });

    // The pair hides; the symbol-only row does not, because it points at no chakra.
    expect(visibleEntries(entries, live).map((row) => row.id)).toEqual(["e-none-s1"]);
    expect(visibleLines(intentions, visibleEntryIds(entries, live)).map((row) => row.text)).toEqual([
      "B",
    ]);
    // Nothing moved: the hidden row still has its lines, in their order.
    expect(intentions.filter((row) => row.entryId === "e-fp1-s1").map((row) => row.text)).toEqual([
      "A",
    ]);
  });

  it("hides a row whose symbol is archived", () => {
    const { entries } = makeEntries([{ meditationId: "fp1", symbolId: "s1", texts: ["A"] }]);
    const live = livenessOf({
      meditations,
      symbols: symbols.map((row) => ({ ...row, archivedAt: 7 })),
    });
    expect(visibleEntries(entries, live)).toEqual([]);
  });

  it("keeps a row visible while both of its references are live", () => {
    const { entries } = makeEntries([{ meditationId: "fp1", symbolId: "s1" }]);
    const live = livenessOf({ meditations, symbols });
    expect(entryIsVisible(entries[0]!, live)).toBe(true);
  });

  it("hides an archived line and a line whose row is hidden", () => {
    const { entries, intentions } = makeEntries([
      { meditationId: "fp1", symbolId: "s1", texts: ["A", "B"] },
    ]);
    const live = livenessOf({ meditations, symbols });
    const visibleIds = visibleEntryIds(entries, live);
    const first = intentions[0]!;
    expect(lineIsVisible(first, visibleIds)).toBe(true);
    expect(lineIsVisible({ ...first, archivedAt: 1 }, visibleIds)).toBe(false);
    expect(lineIsVisible(first, new Set())).toBe(false);
  });

  it("reads `null` as live and a number as archived", () => {
    expect(isLive({ archivedAt: null })).toBe(true);
    expect(isLive({ archivedAt: 0 })).toBe(false);
  });

  it("reports a row with one reference as a complete row", () => {
    const live = livenessOf({ meditations, symbols });
    expect(entryIsVisible(makeEntry("fp1", null, 0), live)).toBe(true);
    expect(entryIsVisible(makeEntry(null, "s1", 0), live)).toBe(true);
    expect(entryIsVisible(makeEntry(null, null, 0), live)).toBe(true);
  });

  it("follows a line's row rather than the record the row names", () => {
    const { entries, intentions } = makeEntries([
      { meditationId: "fp1", symbolId: "s1", texts: ["A"] },
    ]);
    const archivedRow = { ...entries[0]!, archivedAt: 3 };
    const live = livenessOf({ meditations, symbols });
    expect(visibleEntries([archivedRow], live)).toEqual([]);
    expect(visibleLines(intentions, visibleEntryIds([archivedRow], live))).toEqual([]);
  });

  it("shows every line of a row that has no archived parts", () => {
    const lines = makeLines("e-fp1-s1", ["A", "B"]);
    expect(visibleLines(lines, new Set(["e-fp1-s1"]))).toHaveLength(2);
  });
});
