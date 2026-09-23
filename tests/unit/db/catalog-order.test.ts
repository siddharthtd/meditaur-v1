import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FOCUS_ORDER, SYMBOL_ORDER, rankOf } from "../../../packages/db/src/catalog-order.ts";
import { buildDefaultWorkspace } from "../../../packages/db/src/default-workspace.ts";

/**
 * The catalogue's order, and the places that have to agree about it.
 *
 * `default-workspace.ts` writes the seed's rows in the order the reader sees,
 * `catalog-order.ts` is that order written as name lists for the callers that have
 * to *recognise* it — the Dexie upgrade that renumbers a device's existing rows, and
 * the repair that adds the four reiki rows to one — and
 * `20260920140000_symbol_reiki_system.sql` is the same symbol list written out for
 * the cloud tables. Nothing makes them the same thing, so this does.
 */
describe("catalog order", () => {
  it("reads a name with either spelling, and puts what it does not know last", () => {
    expect(rankOf(SYMBOL_ORDER, "Harth")).toBe(0);
    expect(rankOf(SYMBOL_ORDER, "harth"), "case does not matter").toBe(0);
    // The owner writes `Knosa` and `Iawa`; this catalogue writes `Gnosa`/`Iava`.
    expect(rankOf(SYMBOL_ORDER, "Knosa")).toBe(rankOf(SYMBOL_ORDER, "Gnosa"));
    expect(rankOf(SYMBOL_ORDER, "Iawa")).toBe(rankOf(SYMBOL_ORDER, "Iava"));
    expect(rankOf(SYMBOL_ORDER, "Zonar")).toBe(6);
    // The owner's round 16 added four rows at the end of the named ones (§2.5), so
    // `Zonar` is no longer the last name the list carries — the Reiki master symbol
    // is.
    expect(rankOf(SYMBOL_ORDER, "Dai Kyo Mo")).toBe(SYMBOL_ORDER.length - 1);
    expect(rankOf(SYMBOL_ORDER, "Hon Sha Ze Sho Nen")).toBe(7);
    expect(rankOf(SYMBOL_ORDER, "sei hei ki"), "case does not matter").toBe(8);
    expect(rankOf(SYMBOL_ORDER, "Cho Ku Rei")).toBe(9);
    // A row the reader wrote themselves is not ranked, and displaces nothing.
    expect(rankOf(SYMBOL_ORDER, "A Symbol Of My Own")).toBe(SYMBOL_ORDER.length);
    expect(rankOf(SYMBOL_ORDER, null)).toBe(SYMBOL_ORDER.length);
    // `Heart` and `Heart Chakra` are the same centre, and `Rama` is in no list —
    // which is how the seed's own last symbol, and its custom Protection row, stay
    // last instead of being sorted away somewhere in the middle.
    expect(rankOf(FOCUS_ORDER, "Heart Chakra")).toBe(rankOf(FOCUS_ORDER, "Heart"));
    expect(rankOf(SYMBOL_ORDER, "Rama")).toBe(SYMBOL_ORDER.length);
    expect(rankOf(FOCUS_ORDER, "Protection")).toBe(FOCUS_ORDER.length);
  });

  it("ships the seed in exactly that order", () => {
    const catalogue = buildDefaultWorkspace("ws-test");
    const inOrder = (rows: { name: string; sortOrder: number }[]) =>
      [...rows].sort((a, b) => a.sortOrder - b.sortOrder).map((row) => row.name);
    const focusNames = inOrder(catalogue.meditations);
    const symbolNames = inOrder(catalogue.symbols);

    // The rows the lists name come first, in the lists' order…
    expect(focusNames.filter((name) => rankOf(FOCUS_ORDER, name) < FOCUS_ORDER.length)).toEqual([
      "Third-Eye Chakra",
      "Throat Chakra",
      "Heart Chakra",
      "Solar Plexus",
      "Hara Chakra",
      "Root Chakra",
      "Crown Chakra",
      "Liver",
      "Kidneys",
    ]);
    expect(symbolNames.filter((name) => rankOf(SYMBOL_ORDER, name) < SYMBOL_ORDER.length)).toEqual([
      "Harth",
      "Gnosa",
      "Halu",
      "Iava",
      "Shanti",
      "Kriya",
      "Zonar",
      "Hon Sha Ze Sho Nen",
      "Sei Hei Ki",
      "Cho Ku Rei",
      "Dai Kyo Mo",
    ]);
    // …and the rows neither list names follow them rather than being dropped —
    // Protection and Thanks Giving are types of their own, not places on the body.
    expect(focusNames.slice(-2)).toEqual(["Protection", "Thanks Giving"]);
    expect(symbolNames.at(-1)).toBe("Rama");
  });

  it("writes the seed's rows chakra by chakra, in one running order", () => {
    // The owner's complaint, pinned: "I want the data grouped by chakra, right now
    // it is arranged according to symbol". The `pairs` array is written **symbol by
    // symbol**, and each chakra's `sortOrder` used to restart at 0 — so the rows
    // came out grouped by symbol *and* interleaved by place.
    const catalogue = buildDefaultWorkspace("ws-test");
    const chakraPlace = new Map(catalogue.meditations.map((row) => [row.id, row.sortOrder]));
    const rows = [...catalogue.entries].sort((a, b) => a.sortOrder - b.sortOrder);
    const places = rows.map((row) => chakraPlace.get(row.meditationId ?? "") ?? -1);

    expect(places, "each chakra's pairs are together, in the chakras' own order").toEqual(
      [...places].sort((a, b) => a - b),
    );
    expect(new Set(places).size, "and more than one chakra is in the list").toBeGreaterThan(1);
    expect(
      rows.map((row) => row.sortOrder),
      "one running list, not a counter that restarts per chakra",
    ).toEqual(rows.map((_, index) => index));
  });

  /**
   * And the SQL mirror is that same list.
   *
   * The cloud half of this rule is written out in a migration, because a `.sql` file
   * cannot import TypeScript, so it can drift without anything noticing. It had: the
   * comment in `catalog-order.ts` pointed at a `20260919120000_catalog_order.sql`
   * that was never written, and the only symbol order the cloud had came from
   * `20260918150000_row_order.sql`, which numbers rows by name — alphabetically, not
   * the catalogue's own order. This reads the migration's `case` as the list it is
   * and holds it to `SYMBOL_ORDER`, which is what makes the four new rows arrive
   * where the seed puts them rather than above `Harth`.
   */
  it("writes the same symbol list into the SQL mirror", () => {
    const sql = readFileSync(
      new URL(
        "../../../supabase/migrations/20260920140000_symbol_reiki_system.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const block = /case lower\(trim\(s\.name\)\)([\s\S]*?)else (\d+)/.exec(sql);
    expect(block, "the migration writes the order as a case").not.toBeNull();
    const whens = [...block![1].matchAll(/when '([^']+)' then (\d+)/g)].map(([, name, rank]) => ({
      name: name.toLowerCase(),
      rank: Number(rank),
    }));

    expect(whens.map((row) => row.name)).toEqual(
      SYMBOL_ORDER.flat().map((name) => name.toLowerCase()),
    );
    expect(whens.map((row) => row.rank)).toEqual(
      [...whens.map((row) => row.rank)].sort((a, b) => a - b),
    );
    expect(Number(block![2]), "a row in no list follows every named one").toBe(
      SYMBOL_ORDER.length,
    );
  });
});
