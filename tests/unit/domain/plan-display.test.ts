import { describe, expect, it } from "vitest";
import {
  availableDisplayColumns,
  DEFAULT_PLAN_DISPLAY,
  isAppDefaultDisplay,
  normalizePlanDisplay,
  setDisplayColumn,
} from "@meditaur/domain";
import { makeFieldDef } from "../../fixtures/library.ts";

/**
 * The plan's Display panel (§9), which is the only thing that decides what a
 * session shows. The Database holds no display settings of its own (§12.12), so
 * these pure functions are where "which columns" is answered.
 */
describe("the plan's display", () => {
  it("shows the meditation's own columns by default, so a chakra's panel has something to draw", () => {
    // The owner's round 17: *"Chakra details are no-where to be seen on the entire
    // page."* They were not hidden by the screen — `factsFor` emits a fact per
    // **shown** column, so a default that hid the meditation's only built-in column
    // compiled the chakra's panel to an empty list, and `sessionRegions` correctly
    // declined to draw a box with nothing in it.
    expect(DEFAULT_PLAN_DISPLAY.columns.find((column) => column.key === "location")).toMatchObject({
      area: "meditation",
      shown: true,
    });
    expect(DEFAULT_PLAN_DISPLAY.columns.filter((column) => column.shown).length).toBe(3);
  });

  it("tells the app's own default from the reader's arrangement", () => {
    // The gate the v25 repair asks before it changes a stored display: a plan
    // nobody has opened the Display panel on is still the app's, and a plan the
    // reader has arranged is theirs.
    expect(isAppDefaultDisplay(DEFAULT_PLAN_DISPLAY)).toBe(true);
    expect(
      isAppDefaultDisplay({
        columns: [
          { key: "location", area: "meditation", shown: false, pinned: false },
          { key: "description", area: "symbol", shown: true, pinned: false },
          { key: "usage", area: "symbol", shown: true, pinned: false },
        ],
      }),
      // The default this file answered with until round 17 — still the app's, so a
      // plan left alone is never stranded on a default the app has outgrown.
    ).toBe(true);
    expect(
      isAppDefaultDisplay(
        setDisplayColumn(DEFAULT_PLAN_DISPLAY, { key: "element", area: "meditation" }, {
          shown: true,
        }),
      ),
    ).toBe(false);
    expect(isAppDefaultDisplay({ columns: [] })).toBe(false);
  });
  it("falls back to the app's default when a plan has none", () => {
    expect(normalizePlanDisplay(undefined).columns).toEqual(DEFAULT_PLAN_DISPLAY.columns);
    expect(normalizePlanDisplay({}).columns).toEqual(DEFAULT_PLAN_DISPLAY.columns);
    // Not an object, or not a list: the default rather than a crash, because this
    // is read from stored JSON that an older build wrote.
    expect(normalizePlanDisplay(null).columns).toEqual(DEFAULT_PLAN_DISPLAY.columns);
    expect(normalizePlanDisplay({ columns: "nope" }).columns).toEqual([]);
  });

  it("drops a row it cannot read rather than rendering a blank fact", () => {
    const display = normalizePlanDisplay({
      columns: [
        { key: "description", area: "symbol", shown: true, pinned: false },
        { key: "", area: "symbol", shown: true },
        { key: "notes", area: "elsewhere", shown: true },
        { key: "usage", area: "symbol" },
      ],
    });
    expect(display.columns).toEqual([
      { key: "description", area: "symbol", shown: true, pinned: false },
      // `shown` defaults on: a stored row is a column the reader asked for.
      { key: "usage", area: "symbol", shown: true, pinned: false },
    ]);
  });

  it("offers each table's built-in columns and the reader's own", () => {
    const columns = availableDisplayColumns([
      makeFieldDef({ id: "fd1", scope: "meditation", key: "element", label: "Element" }),
      makeFieldDef({ id: "fd2", scope: "entry", key: "pair-note", label: "Pair note" }),
    ]);
    expect(columns.map((column) => `${column.area}:${column.key}`)).toEqual([
      "meditation:name",
      "meditation:location",
      "meditation:element",
      "symbol:name",
      "symbol:description",
      "symbol:usage",
      "entry:pair-note",
    ]);
  });

  it("shows a column when it is pinned, because a pinned-but-invisible column is not a state", () => {
    const pinned = setDisplayColumn(DEFAULT_PLAN_DISPLAY, { key: "location", area: "meditation" }, {
      pinned: true,
    });
    expect(pinned.columns.find((column) => column.key === "location")).toMatchObject({
      shown: true,
      pinned: true,
    });
  });

  it("unpins a column that is hidden", () => {
    const hidden = setDisplayColumn(DEFAULT_PLAN_DISPLAY, { key: "usage", area: "symbol" }, {
      shown: false,
    });
    expect(hidden.columns.find((column) => column.key === "usage")).toMatchObject({
      shown: false,
      pinned: false,
    });
  });

  it("appends a column the display has never heard of", () => {
    const added = setDisplayColumn(DEFAULT_PLAN_DISPLAY, { key: "element", area: "meditation" }, {
      shown: true,
    });
    expect(added.columns.map((column) => column.key)).toEqual([
      "location",
      "description",
      "usage",
      "element",
    ]);
    // And the default it started from is untouched: a plan owns its display.
    expect(DEFAULT_PLAN_DISPLAY.columns.map((column) => column.key)).toEqual([
      "location",
      "description",
      "usage",
    ]);
  });
});
