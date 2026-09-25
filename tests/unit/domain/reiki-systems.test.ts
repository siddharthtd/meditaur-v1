import { describe, expect, it } from "vitest";
import {
  DEFAULT_FEATURE_FLAGS,
  REIKI_SYSTEMS,
  type ReikiSystem,
  SEEDED_REIKI_SYMBOLS,
  isSymbolSystemEnabled,
  visibleSymbols,
  type FeatureFlags,
} from "@meditaur/domain";

/**
 * The systems a surface may list, and the one property that must survive any set of flags
 * (round 16 §2.5, `P0 · 23`'s slice 23a).
 *
 * The answer used to be a constant — every system, for ever — because the owner's words
 * then were "it should default to true until the admin-panel is ready". The panel is what
 * `P0 · 23` builds, so the constant is a flag now; what must not change with it is the
 * safety rule: a symbol the reader adds is not hidden by a flag that is about the
 * catalogue the app ships.
 */
/** The set a row resolves to: the defaults, with the named flags overridden. */
const from = (row: Partial<Record<keyof FeatureFlags, boolean>>): FeatureFlags => ({
  ...DEFAULT_FEATURE_FLAGS,
  ...row,
});

describe("the reiki systems the app enables", () => {
  it("enables every system when nothing says otherwise", () => {
    // Signed out, no cloud pair, or a row that names nothing: the app a reader gets
    // before any account exists is the app with everything on.
    for (const system of REIKI_SYSTEMS) {
      expect(isSymbolSystemEnabled(system, DEFAULT_FEATURE_FLAGS), `${system} is on`).toBe(true);
      expect(isSymbolSystemEnabled(system, null), `${system} is on with no flags at all`).toBe(
        true,
      );
      expect(isSymbolSystemEnabled(system, undefined), `${system} is on with no flags`).toBe(true);
    }
  });

  it("hides only the system whose own flag is off", () => {
    // The three system names *are* three flag names, so the answer is asked under the
    // system's own name rather than through a mapping that could fall out of step.
    const flags = from({ karuna_reiki: false });
    expect(isSymbolSystemEnabled("karuna_reiki", flags)).toBe(false);
    expect(isSymbolSystemEnabled("usui_reiki", flags)).toBe(true);
    expect(isSymbolSystemEnabled("reiki_master", flags)).toBe(true);
  });

  it("never hides a symbol that names no system", () => {
    // The row a reader's own `Add` produces: no surface offers a system yet, so the row
    // carries none — and the flag is the owner's say over the rows the app ships, not
    // over the reader's. Every system off is the hardest case of that.
    const everySystemOff = from({ karuna_reiki: false, usui_reiki: false, reiki_master: false });
    expect(isSymbolSystemEnabled(undefined, everySystemOff)).toBe(true);
    expect(isSymbolSystemEnabled(null, everySystemOff)).toBe(true);
    expect(isSymbolSystemEnabled(undefined, null)).toBe(true);
  });

  it("lists only the systems the flags enable, and always the rows that name none", () => {
    // The seam every offer surface asks (`P0 · 35`, slice 35b) — the library's Symbols
    // tab, the Database's Symbols table, the planner's two pickers. `isSymbolSystemEnabled`
    // answers about one row; this is that answer applied to a list, in one place, so a
    // surface cannot ask a subtly different question.
    const rows = [
      { id: "k1", reikiSystem: "karuna_reiki" as const },
      { id: "u1", reikiSystem: "usui_reiki" as const },
      { id: "m1", reikiSystem: "reiki_master" as const },
      { id: "own" },
    ];
    const karunaOff = from({ karuna_reiki: false });
    expect(visibleSymbols(rows, karunaOff).map((row) => row.id)).toEqual(["u1", "m1", "own"]);
    expect(visibleSymbols(rows, DEFAULT_FEATURE_FLAGS).map((row) => row.id)).toEqual([
      "k1",
      "u1",
      "m1",
      "own",
    ]);
    // No flags at all is the app before any account existed, not an empty catalogue.
    expect(visibleSymbols(rows, null)).toHaveLength(4);
    expect(visibleSymbols([], karunaOff)).toEqual([]);
  });

  it("carries the union as the owner spelled it, and every seeded row names one", () => {
    // Two of the four rows are Usui Reiki and one is the master symbol; the eight the
    // app shipped before this round are Karuna Reiki, which the seed and the Dexie
    // repair both write (`tests/unit/db/reiki-symbols.test.ts`).
    expect(SEEDED_REIKI_SYMBOLS.map((row) => [row.name, row.reikiSystem])).toEqual([
      ["Hon Sha Ze Sho Nen", "usui_reiki"],
      ["Sei Hei Ki", "usui_reiki"],
      ["Cho Ku Rei", "usui_reiki"],
      // The owner's spelling, kept: it is the Usui Master symbol, usually "Dai Ko
      // Myo", and the label is theirs to choose.
      ["Dai Kyo Mo", "reiki_master"],
    ]);
    const systems: readonly ReikiSystem[] = REIKI_SYSTEMS;
    expect(systems).toEqual(["karuna_reiki", "usui_reiki", "reiki_master"]);
    for (const row of SEEDED_REIKI_SYMBOLS) {
      expect(REIKI_SYSTEMS).toContain(row.reikiSystem);
    }
  });
});
