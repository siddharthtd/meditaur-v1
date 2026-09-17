import { describe, expect, it } from "vitest";
import {
  PREFERENCES_ERRORS,
  preferencesConflict,
  stampedPreferences,
} from "@meditaur/application";
import { makePrefs } from "../../fixtures/library.ts";

describe("preference versioning", () => {
  it("stamps the clock and leaves the revision to the store", () => {
    const next = stampedPreferences({ ...makePrefs({ revision: 4 }), autoAdvance: false }, 500);
    expect(next.updatedAt).toBe(500);
    expect(next.autoAdvance).toBe(false);
    // Which revision comes next is the store's decision: it is the one that
    // compares what it holds against what the caller read.
    expect(next.revision).toBe(4);
  });

  it("has one sentence for a refused write", () => {
    // The store answers null; this is the only place that becomes words, so the
    // message cannot drift into a second copy of itself.
    expect(() => preferencesConflict()).toThrow(PREFERENCES_ERRORS.conflict);
  });
});
