import { describe, expect, it } from "vitest";
import { DEFAULT_FEATURE_FLAGS, type FeatureFlags } from "@meditaur/domain";
import {
  FIXED_DATABASE_TABLES,
  databaseTables,
  parseDatabaseTable,
} from "../../../apps/web/src/features/database/database-tables.ts";

/**
 * The Database's strip, and the two tables `karuna_reiki` hides (`P0 · 35`, slice 35c).
 *
 * The strip is asked three things of one list — which buttons the rail draws, what the
 * current table is called, and which table a plain `/database` lands on — so this pins
 * the list itself rather than a screen that renders it.
 */
/** The set a row resolves to: the defaults, with the named flags overridden. */
const from = (row: Partial<Record<keyof FeatureFlags, boolean>>): FeatureFlags => ({
  ...DEFAULT_FEATURE_FLAGS,
  ...row,
});

const karunaOff = from({ karuna_reiki: false });
/** No types at all, so the strip is exactly the fixed tables. */
const ids = (flags?: FeatureFlags) => databaseTables([], flags).map((row) => row.id);

describe("the Database's table strip", () => {
  it("offers every table while the flags are on, Karuna included", () => {
    expect(ids()).toEqual(FIXED_DATABASE_TABLES.map((row) => row.id));
    expect(ids(DEFAULT_FEATURE_FLAGS)).toEqual([
      "entries",
      "symbols",
      "presets",
      "affirmations",
      "types",
    ]);
  });

  it("takes both Karuna tables out of the strip when the flag is off", () => {
    // They are one feature: `entries` is the Karuna grid and `affirmations` draws the
    // same rows, which is why the owner's "the Karuna Database is only available on the
    // `karuna_reiki` FF" hides both doors. The rows themselves are untouched, and a
    // meditation's own sentences stay on the meditation they belong to.
    expect(ids(karunaOff)).toEqual(["symbols", "presets", "types"]);
  });

  it("lands a plain /database on a table the strip still offers", () => {
    // The fallback used to be Karuna itself: right while it is offered, and a lost
    // screen once it is not, because the rail is what draws the buttons.
    expect(parseDatabaseTable(null, [])).toBe("entries");
    expect(parseDatabaseTable(null, [], karunaOff)).toBe("symbols");
    // A remembered table the flag now hides is the same case — it is not offered, so it
    // is not where the reader lands.
    expect(parseDatabaseTable("affirmations", [], karunaOff)).toBe("symbols");
    expect(parseDatabaseTable("entries", [], karunaOff)).toBe("symbols");
    // …and a table that is still offered is still honoured.
    expect(parseDatabaseTable("presets", [], karunaOff)).toBe("presets");
  });
});
