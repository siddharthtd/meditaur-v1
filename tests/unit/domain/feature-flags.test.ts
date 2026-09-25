import { describe, expect, it } from "vitest";
import {
  CHAKRA_TYPE_ID,
  DEFAULT_FEATURE_FLAGS,
  FEATURE_FLAGS,
  FEATURE_FLAG_INFO,
  flagIsOn,
  normalizeFeatureFlags,
  visibleTypes,
} from "@meditaur/domain";

/**
 * The flags' vocabulary (`P0 · 23`, slice 23a), which is the pure half of the owner's
 * answer in `DECISIONS.md` §11.
 *
 * Three properties carry the whole design, and each is one case below:
 *
 * - **Every default is true**, so a device with no cloud, nobody signed in, or a row
 *   written before a flag existed behaves exactly as the app does today. A flag is only
 *   ever a subtraction the owner makes for one account.
 * - **A row is sparse** — an absent key is the default — which is what lets a flag be
 *   added to the union without rewriting every stored account, and what makes
 *   `normalizeFeatureFlags` the function the adapters go through.
 * - **A surface that names nothing is never hidden.** The reader's own rows and the
 *   catalogue's untagged ones are outside the owner's say, so the questions answer `true`
 *   for them however the flags are set.
 */
describe("the feature flags", () => {
  it("has a complete vocabulary: one list, one default, one label each", () => {
    // `FEATURE_FLAGS` is the list the panel draws and the migration's key list is checked
    // against, so a flag that reaches the union and not the list is a flag no screen ever
    // offers and no guard ever sees.
    const keys = Object.keys(DEFAULT_FEATURE_FLAGS).sort();
    expect([...FEATURE_FLAGS].sort()).toEqual(keys);
    expect(Object.keys(FEATURE_FLAG_INFO).sort()).toEqual(keys);
    expect(new Set(FEATURE_FLAGS).size, "no flag twice").toBe(FEATURE_FLAGS.length);

    // Every default on: the app a reader gets before any account exists is the app with
    // everything showing.
    for (const flag of FEATURE_FLAGS) {
      expect(DEFAULT_FEATURE_FLAGS[flag], `${flag} defaults on`).toBe(true);
      expect(flagIsOn(DEFAULT_FEATURE_FLAGS, flag), `${flag} is on`).toBe(true);
      const info = FEATURE_FLAG_INFO[flag];
      expect(info.label.length, `${flag} has a label`).toBeGreaterThan(2);
      expect(info.summary.length, `${flag} explains itself`).toBeGreaterThan(20);
    }
  });

  it("reads a sparse row: an absent key is the default, and nothing else is a value", () => {
    // The row shape the flags column holds: an absent key means "the app's answer", so a
    // flag added after an account was created is on for that account rather than missing.
    expect(normalizeFeatureFlags({})).toEqual(DEFAULT_FEATURE_FLAGS);
    expect(normalizeFeatureFlags({ karuna_reiki: false })).toEqual({
      ...DEFAULT_FEATURE_FLAGS,
      karuna_reiki: false,
    });

    // And the shapes a `jsonb` column can hold that this build has never written: an
    // older version's key, a hand-edited value, a null, a string, or nothing at all.
    const stored = normalizeFeatureFlags({
      karuna_reiki: false,
      symbol_system_tabs: false,
      binaural: "off",
      admin_panel: null,
    });
    expect(stored.karuna_reiki).toBe(false);
    expect(stored.binaural, "a value that is not a boolean is the default").toBe(true);
    expect(stored.admin_panel).toBe(true);
    expect(Object.keys(stored).sort(), "an unknown key is dropped, not carried").toEqual(
      [...FEATURE_FLAGS].sort(),
    );

    for (const nothing of [null, undefined, "false", 0, []]) {
      expect(normalizeFeatureFlags(nothing), `nothing stored: ${String(nothing)}`).toEqual(
        DEFAULT_FEATURE_FLAGS,
      );
    }
  });

  it("answers with the default when no set has arrived at all", () => {
    // Not signed in, no cloud pair, or a read that failed: all three are "nobody has told
    // us", and all three have to draw the whole app rather than an empty one.
    for (const flag of FEATURE_FLAGS) {
      expect(flagIsOn(null, flag), `${flag} with no flags`).toBe(true);
      expect(flagIsOn(undefined, flag), `${flag} with undefined`).toBe(true);
    }
    expect(flagIsOn({ ...DEFAULT_FEATURE_FLAGS, chakras: false }, "chakras")).toBe(false);
  });

  it("answers a partial set key by key, so a flag added since is never read as off", () => {
    // What the Dexie mirror holds: a set written by a build that did not know every flag
    // this one does. A bare lookup would read the absent key as `false` and hide a feature
    // because the value predates it, which is the one direction a flag must not fail in.
    const stored: Partial<Record<"chakras" | "binaural", boolean>> = { chakras: false };
    expect(flagIsOn(stored, "chakras")).toBe(false);
    expect(flagIsOn(stored, "binaural"), "a flag the row never knew is the default").toBe(true);
  });

  it("hides the Chakra type and nothing else it did not author", () => {
    const types = [
      { id: CHAKRA_TYPE_ID, name: "Chakra" },
      { id: "01900000-0000-7000-8000-0000000000c1", name: "Thanks Giving" },
      { id: "reader-1", name: "My own type" },
    ];
    expect(visibleTypes(types, DEFAULT_FEATURE_FLAGS)).toEqual(types);
    expect(visibleTypes(types, null), "no flags means nothing is hidden").toEqual(types);
    expect(visibleTypes(types, { ...DEFAULT_FEATURE_FLAGS, chakras: false })).toEqual([
      { id: "01900000-0000-7000-8000-0000000000c1", name: "Thanks Giving" },
      { id: "reader-1", name: "My own type" },
    ]);
  });
});
