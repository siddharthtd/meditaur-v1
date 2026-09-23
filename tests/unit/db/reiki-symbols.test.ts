import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_REIKI_SYSTEM, SEEDED_REIKI_SYMBOLS, type Symbol } from "@meditaur/domain";
import { buildDefaultWorkspace } from "../../../packages/db/src/default-workspace.ts";
import { symbolsWithReikiSystems } from "../../../packages/db/src/reiki-symbols.ts";

const WORKSPACE = "01900000-0000-7000-8000-000000000002";

/**
 * The four rows the owner added, and the system every symbol belongs to.
 *
 * A device that already holds a catalogue is the case that matters, and it is the
 * one no seed can serve: the seed runs once, and every version that has already run
 * is never re-run. So the repair is v24's job — and IndexedDB is not available in
 * the unit suite, which is why the rule is a pure function here and the version's
 * body is one line (`symbolsWithReikiSystems`).
 */
function aSymbol(id: number, name: string, sortOrder: number): Symbol {
  return {
    id: `01900000-0000-7000-8000-${id.toString(16).padStart(12, "0")}`,
    workspaceId: WORKSPACE,
    name,
    description: `${name} description`,
    usage: `${name} usage`,
    imageAssetId: null,
    sortOrder,
    archivedAt: null,
    revision: 0,
    updatedAt: 0,
  };
}

/**
 * What the catalogue looked like before this round: eight symbols, none of them
 * naming a system, because there was only one system to name.
 */
function beforeTheRound(): Symbol[] {
  return [
    aSymbol(0x33, "Harth", 0),
    aSymbol(0x34, "Gnosa", 1),
    aSymbol(0x32, "Halu", 2),
    aSymbol(0x35, "Iava", 3),
    aSymbol(0x37, "Shanti", 4),
    aSymbol(0x36, "Kriya", 5),
    aSymbol(0x31, "Zonar", 6),
    aSymbol(0x30, "Rama", 7),
  ];
}

describe("a symbol's reiki system", () => {
  it("stamps the system every symbol already had", () => {
    const rows = symbolsWithReikiSystems(beforeTheRound());
    const stamped = rows.filter((row) => row.reikiSystem === DEFAULT_REIKI_SYSTEM);
    expect(stamped.map((row) => row.name)).toEqual([
      "Harth",
      "Gnosa",
      "Halu",
      "Iava",
      "Shanti",
      "Kriya",
      "Zonar",
      "Rama",
    ]);
  });

  it("adds the four rows with the seed's ids, systems and empty text", () => {
    const rows = symbolsWithReikiSystems(beforeTheRound());
    const added = rows.filter((row) => SEEDED_REIKI_SYMBOLS.some((it) => it.id === row.id));

    expect(added.map((row) => row.name)).toEqual([
      "Hon Sha Ze Sho Nen",
      "Sei Hei Ki",
      "Cho Ku Rei",
      "Dai Kyo Mo",
    ]);
    expect(added.map((row) => row.reikiSystem)).toEqual([
      "usui_reiki",
      "usui_reiki",
      "usui_reiki",
      "reiki_master",
    ]);
    // The owner's §2.5: empty, because they will fill them in from the Database.
    expect(added.map((row) => [row.description, row.usage])).toEqual([
      ["", ""],
      ["", ""],
      ["", ""],
      ["", ""],
    ]);
    // The workspace every read scopes by, which is the defect v19 exists to
    // remember: a row written without one exists and is invisible.
    expect(added.every((row) => row.workspaceId === WORKSPACE)).toBe(true);
  });

  it("places them where the catalogue's order puts them, not at the end", () => {
    const rows = symbolsWithReikiSystems(beforeTheRound());
    const places = new Map([
      ...beforeTheRound().map((row) => [row.name, row.sortOrder] as const),
      ...rows.map((row) => [row.name, row.sortOrder] as const),
    ]);
    // The four names sit after `Zonar` and before `Rama`, which is in no list —
    // which is also why `Rama` moves: four rows were inserted ahead of it.
    expect(places.get("Hon Sha Ze Sho Nen")).toBe(7);
    expect(places.get("Sei Hei Ki")).toBe(8);
    expect(places.get("Cho Ku Rei")).toBe(9);
    expect(places.get("Dai Kyo Mo")).toBe(10);
    expect(places.get("Rama")).toBe(11);
    expect(places.get("Zonar"), "a row whose place is unchanged is not rewritten").toBe(6);
  });

  it("writes nothing to a device the seed already served", () => {
    // The strongest agreement there is: the seed's own rows, read back as the store
    // would return them, are what the repair considers correct. The two halves of
    // the order — the seed's array and `SYMBOL_ORDER` — meet here.
    expect(symbolsWithReikiSystems(buildDefaultWorkspace("ws-test").symbols)).toEqual([]);
  });

  it("leaves a symbol the reader added alone, and never hides it", () => {
    const mine: Symbol = {
      ...aSymbol(0x51, "A Symbol Of My Own", 7),
      // No surface offers a system yet, so this is what a row the reader adds
      // carries: nothing. It is stamped, because after this round every row names
      // the system the app shipped then — and `isSymbolSystemEnabled(undefined)` is
      // true regardless, so a row that names none is never hidden either.
      reikiSystem: undefined,
    };
    const existing = [...beforeTheRound(), mine];
    const rows = symbolsWithReikiSystems(existing);
    const stamped = rows.find((row) => row.id === mine.id);
    expect(stamped?.reikiSystem).toBe(DEFAULT_REIKI_SYSTEM);
    expect(stamped?.name).toBe("A Symbol Of My Own");
    expect(stamped?.description).toBe("A Symbol Of My Own description");
  });

  it("keeps a system a row already names", () => {
    const imported: Symbol = {
      ...aSymbol(0x52, "Zonar", 6),
      reikiSystem: "usui_reiki",
    };
    const row = symbolsWithReikiSystems([imported]).find((it) => it.id === imported.id);
    expect(row?.reikiSystem, "an upgrade does not overrule the reader's own data").toBe(
      "usui_reiki",
    );
  });

  it("does not seed a second row beside one the reader already named that way", () => {
    const theirs = aSymbol(0x50, "cho ku rei", 7);
    const rows = symbolsWithReikiSystems([...beforeTheRound(), theirs]);
    expect(
      rows.filter((row) => row.name.toLowerCase() === "cho ku rei").map((row) => row.id),
      "the reader's row is the row",
    ).toEqual([theirs.id]);
  });

  it("adds nothing where there is no catalogue to add to", () => {
    // A device that has never seeded itself gets these rows from the seed, which is
    // where a new catalogue belongs; there is no workspace here to hang them on.
    expect(symbolsWithReikiSystems([])).toEqual([]);
  });

  it("ships the same twelve rows on a fresh device", () => {
    // The other half of the trap: the repair serves a device that exists, and the
    // seed serves one that does not. They are two mirrors of one list.
    const catalogue = buildDefaultWorkspace("ws-test");
    expect(
      catalogue.symbols
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((row) => [row.name, row.reikiSystem]),
    ).toEqual([
      ["Harth", "karuna_reiki"],
      ["Gnosa", "karuna_reiki"],
      ["Halu", "karuna_reiki"],
      ["Iava", "karuna_reiki"],
      ["Shanti", "karuna_reiki"],
      ["Kriya", "karuna_reiki"],
      ["Zonar", "karuna_reiki"],
      ["Hon Sha Ze Sho Nen", "usui_reiki"],
      ["Sei Hei Ki", "usui_reiki"],
      ["Cho Ku Rei", "usui_reiki"],
      ["Dai Kyo Mo", "reiki_master"],
      ["Rama", "karuna_reiki"],
    ]);
    const four = catalogue.symbols.filter((row) =>
      SEEDED_REIKI_SYMBOLS.some((seeded) => seeded.id === row.id),
    );
    expect(four.map((row) => [row.description, row.usage])).toEqual([
      ["", ""],
      ["", ""],
      ["", ""],
      ["", ""],
    ]);
  });
});

/**
 * And the repair is wired into the store.
 *
 * The cases above prove the rule. Deleting the v24 block would leave every one of
 * them green and the owner's device with eight symbols and no system, which is the
 * failure mode this whole version exists for — so this half reads the source, like
 * the other structural guards here, because the unit suite has no IndexedDB to
 * upgrade.
 */
describe("the repair is wired into the store", () => {
  const schema = readFileSync(
    new URL("../../../packages/db/src/schema.ts", import.meta.url),
    "utf8",
  );

  /** One `this.version(n)` block, up to whichever version follows it. */
  function versionBlock(n: number): string {
    const start = schema.indexOf(`this.version(${n})`);
    expect(start, `schema.ts declares a version ${n}`).toBeGreaterThan(-1);
    const next = schema.indexOf("this.version(", start + 1);
    return schema.slice(start, next === -1 ? undefined : next);
  }

  it("adds the systems and the four rows in a version above the sentences merge", () => {
    const block = versionBlock(24);
    expect(block).toContain("symbolsWithReikiSystems(");
    expect(block).toContain('table("symbols").put(');
  });

  it("leaves v23 alone, because a repair edited into it would repair nobody", () => {
    expect(versionBlock(23)).not.toContain("symbolsWithReikiSystems(");
  });
});
