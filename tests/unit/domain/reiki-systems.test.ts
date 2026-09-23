import { describe, expect, it } from "vitest";
import {
  ENABLED_REIKI_SYSTEMS,
  REIKI_SYSTEMS,
  type ReikiSystem,
  SEEDED_REIKI_SYMBOLS,
  isSymbolSystemEnabled,
} from "@meditaur/domain";

/**
 * The flag the owner asked for, and the one property it has to keep (round 16, §2.5
 * and item 10 of the brief).
 *
 * The three systems are on today because the owner's own words are "it should default
 * to true until the admin-panel is ready", and the admin panel is what will decide
 * this set's real home. What must not wait for that panel is the safety rule: a
 * symbol the reader adds must not be hidden by a flag that is about the catalogue the
 * app ships.
 */
describe("the reiki systems the app enables", () => {
  it("enables every system, which is the owner's answer until the admin panel exists", () => {
    expect(ENABLED_REIKI_SYSTEMS).toEqual([...REIKI_SYSTEMS]);
    for (const system of REIKI_SYSTEMS) {
      expect(isSymbolSystemEnabled(system), `${system} is on`).toBe(true);
    }
  });

  it("never hides a symbol that names no system", () => {
    // The row a reader's own `Add` produces: no surface offers a system yet, so the
    // row carries none — and the flag is the admin's say over the rows the app
    // ships, not over the reader's.
    expect(isSymbolSystemEnabled(undefined)).toBe(true);
    expect(isSymbolSystemEnabled(null)).toBe(true);
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
