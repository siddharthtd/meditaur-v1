import { describe, expect, it } from "vitest";
import { compilePlan, MAX_TONES_PER_EAR, SNAPSHOT_SCHEMA_VERSION } from "@meditaur/domain";
import {
  makeIntentions,
  makeBinding,
  makeBlock,
  makeFieldDef,
  makeFocus,
  makeLibrary,
  makePlan,
  makeSymbol,
  makeTableView,
} from "../../fixtures/library.ts";

const library = makeLibrary();

describe("compilePlan", () => {
  it("assigns the next symbol on a focus point when symbolId is null", () => {
    const snapshot = compilePlan(
      makePlan([
        makeBlock("b1", 0, "focus"),
        makeBlock("b2", 1, "cooloff", { focusPointId: null, binauralPresetId: null, tableViewId: null }),
        makeBlock("b3", 2, "focus"),
      ]),
      library,
      { now: 1, id: () => "inst1" },
    );
    expect(snapshot.blocks[0].symbolName).toBe("Lam");
    expect(snapshot.blocks[0].intentions).toEqual(["I am grounded", "I am safe"]);
    expect(snapshot.blocks[1].type).toBe("cooloff");
    expect(snapshot.blocks[1].binaural).toBeNull();
    expect(snapshot.blocks[2].symbolName).toBe("Earth");
    expect(snapshot.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
  });

  it("compiles all bound symbols and focus-level lines when symbolScope is all", () => {
    const snapshot = compilePlan(
      makePlan([
        makeBlock("b1", 0, "focus", { symbolId: null, symbolScope: "all" }),
      ]),
      makeLibrary({
        intentions: [
          ...makeIntentions("fp1", null, ["I arrive"]),
          ...makeIntentions("fp1", "s1", ["I am grounded", "I am safe"]),
          ...makeIntentions("fp1", "s2", ["Body is home"]),
          ...makeIntentions("fp2", "s1", ["Heart Lam line"]),
        ],
      }),
      { now: 1, id: () => "inst1" },
    );
    const block = snapshot.blocks[0];
    expect(block.symbolName).toBeNull();
    expect(block.intentions).toEqual(["I arrive", "I am grounded", "I am safe", "Body is home"]);
    expect(block.focusIntentions).toEqual(["I arrive"]);
    expect(block.symbolGroups).toEqual([
      {
        name: "Lam",
        description: "Lam description",
        usage: "Lam usage",
        imageAssetId: null,
        intentions: ["I am grounded", "I am safe"],
      },
      {
        name: "Earth",
        description: "Earth description",
        usage: "Earth usage",
        imageAssetId: null,
        intentions: ["Body is home"],
      },
    ]);
  });

  it("carries each symbol's picture into its group, and null when it has none", () => {
    const snapshot = compilePlan(
      makePlan([makeBlock("b1", 0, "focus", { symbolId: null, symbolScope: "all" })]),
      makeLibrary({
        symbols: [
          makeSymbol("s1", "Lam", { imageAssetId: "asset-lam" }),
          makeSymbol("s2", "Earth"),
        ],
        intentions: [
          ...makeIntentions("fp1", "s1", ["I am grounded"]),
          ...makeIntentions("fp1", "s2", ["Body is home"]),
        ],
      }),
      { now: 1, id: () => "inst1" },
    );

    expect(snapshot.blocks[0].symbolGroups.map((group) => group.imageAssetId)).toEqual([
      "asset-lam",
      null,
    ]);
    // The picture travels with the group even for a single-symbol block.
    const single = compilePlan(
      makePlan([makeBlock("b1", 0, "focus", { symbolId: "s1" })]),
      makeLibrary({ symbols: [makeSymbol("s1", "Lam", { imageAssetId: "asset-lam" })] }),
      { now: 1, id: () => "inst1" },
    );
    expect(single.blocks[0].symbolGroups).toEqual([
      {
        name: "Lam",
        description: "Lam description",
        usage: "Lam usage",
        imageAssetId: "asset-lam",
        intentions: ["I am grounded", "I am safe"],
      },
    ]);
  });

  it("uses pair intentions for the current focus when a symbol is shared", () => {
    const snapshot = compilePlan(
      makePlan([makeBlock("b1", 0, "focus", { focusPointId: "fp2", symbolId: "s1" })]),
      makeLibrary({
        bindings: [
          makeBinding("fp1", "s1", 0),
          makeBinding("fp1", "s2", 1),
          makeBinding("fp2", "s1", 0),
          makeBinding("fp2", "s3", 1),
        ],
        intentions: [
          ...makeIntentions("fp1", "s1", ["Root Lam"]),
          ...makeIntentions("fp2", "s1", ["Heart Lam"]),
        ],
      }),
      { now: 1, id: () => "inst1" },
    );
    expect(snapshot.blocks[0].symbolName).toBe("Lam");
    expect(snapshot.blocks[0].intentions).toEqual(["Heart Lam"]);
    expect(snapshot.blocks[0].symbolGroups[0]?.intentions).toEqual(["Heart Lam"]);
  });

  it("deep-copies tone lists and EQ into the snapshot", () => {
    const snapshot = compilePlan(makePlan([makeBlock("b1", 0, "focus")]), library, {
      now: 1,
      id: () => "inst1",
    });
    const binaural = snapshot.blocks[0].binaural;
    expect(binaural?.leftTones).toHaveLength(1);
    expect(binaural?.rightTones).toHaveLength(1);
    expect(binaural?.eqRight.bands).toHaveLength(10);
    binaural?.leftTones.push({ id: "mut", hz: 1, gain: 1 });
    expect(library.presets[0].leftTones).toHaveLength(1);
  });

  it("rejects a preset with more than 16 tones per ear", () => {
    const left = Array.from({ length: MAX_TONES_PER_EAR + 1 }, (_, i) => ({
      id: `t${i}`,
      hz: 100 + i,
      gain: 0.2,
    }));
    const presets = [{ ...library.presets[0], leftTones: left }];
    expect(() =>
      compilePlan(makePlan([makeBlock("b1", 0, "focus")]), { ...library, presets }),
    ).toThrow(/16/);
  });

  it("applies durationOverrideMs without reading a public env flag", () => {
    const snapshot = compilePlan(
      makePlan([
        makeBlock("b1", 0, "focus", { durationMs: 120_000 }),
        makeBlock("b2", 1, "cooloff", {
          durationMs: 30_000,
          focusPointId: null,
          binauralPresetId: null,
          tableViewId: null,
        }),
      ]),
      library,
      { now: 1, id: () => "inst1", durationOverrideMs: 200 },
    );
    expect(snapshot.blocks.map((block) => block.durationMs)).toEqual([200, 200]);
  });

  it("fills custom field columns from field values", () => {
    const snapshot = compilePlan(
      makePlan([makeBlock("b1", 0, "focus", { symbolId: "s1" })]),
      {
        ...library,
        fieldDefs: [makeFieldDef()],
        fieldValues: [{ entityId: "s1", fieldDefId: "fd1", text: "lam", revision: 0, updatedAt: 0 }],
        tableViews: [makeTableView({ columnKeys: ["name", "seed"] })],
      },
      { now: 1, id: () => "inst1" },
    );
    expect(snapshot.blocks[0].table?.columns.map((c) => c.label)).toEqual(["Name", "Seed"]);
    expect(snapshot.blocks[0].table?.rows[0]).toEqual(["Lam", "lam"]);
  });

  it("joins pair intentions for the current focus in a table cell", () => {
    const snapshot = compilePlan(
      makePlan([makeBlock("b1", 0, "focus", { symbolId: "s1" })]),
      makeLibrary({
        tableViews: [makeTableView({ columnKeys: ["name", "intentions"], symbolFilter: "block" })],
        intentions: [
          ...makeIntentions("fp1", "s1", ["Root A", "Root B"]),
          ...makeIntentions("fp2", "s1", ["Heart only"]),
        ],
        bindings: [makeBinding("fp1", "s1", 0), makeBinding("fp2", "s1", 0)],
        focusPoints: [makeFocus("fp1", "Root"), makeFocus("fp2", "Heart")],
        symbols: [makeSymbol("s1", "Lam")],
      }),
      { now: 1, id: () => "inst1" },
    );
    expect(snapshot.blocks[0].table?.rows[0]).toEqual(["Lam", "Root A · Root B"]);
  });

  it("rejects a non-null catalog id that is not in the library", () => {
    expect(() =>
      compilePlan(
        makePlan([makeBlock("b1", 0, "focus", { binauralPresetId: "gone" })]),
        library,
      ),
    ).toThrow("Block b1 points at a missing preset");
    expect(() =>
      compilePlan(
        makePlan([makeBlock("b1", 0, "focus", { tableViewId: "gone" })]),
        library,
      ),
    ).toThrow("Block b1 points at a missing table view");
    expect(() =>
      compilePlan(
        makePlan([makeBlock("b1", 0, "focus", { ambientAssetId: "gone" })]),
        library,
      ),
    ).toThrow("Block b1 points at a missing ambient audio");
    expect(() =>
      compilePlan(
        makePlan([makeBlock("b1", 0, "focus", { alarmAssetId: "gone" })]),
        library,
      ),
    ).toThrow("Block b1 points at a missing alarm audio");
    expect(() =>
      compilePlan(
        makePlan([makeBlock("b1", 0, "focus", { focusPointId: "gone" })]),
        library,
      ),
    ).toThrow("Block b1 points at a missing focus point");
    expect(() =>
      compilePlan(
        makePlan([makeBlock("b1", 0, "focus", { symbolId: "gone" })]),
        library,
      ),
    ).toThrow("Block b1 points at a missing symbol");
  });

  it("keeps binaural when both the plan and the focus point allow it", () => {
    const snapshot = compilePlan(makePlan([makeBlock("b1", 0, "focus")]), library, {
      now: 1,
      id: () => "inst1",
    });
    expect(snapshot.blocks[0].binaural).not.toBeNull();
    expect(snapshot.blocks[0].binaural?.leftTones.length).toBeGreaterThan(0);
  });

  it("skips binaural when the plan toggle is off", () => {
    const snapshot = compilePlan(
      makePlan([makeBlock("b1", 0, "focus")], { binauralEnabled: false }),
      library,
      { now: 1, id: () => "inst1" },
    );
    expect(snapshot.blocks[0].binaural).toBeNull();
  });

  it("skips binaural when only the focus point toggle is off", () => {
    const snapshot = compilePlan(
      makePlan([makeBlock("b1", 0, "focus")]),
      makeLibrary({
        focusPoints: [makeFocus("fp1", "Root", { binauralEnabled: false })],
      }),
      { now: 1, id: () => "inst1" },
    );
    expect(snapshot.blocks[0].binaural).toBeNull();
  });

  it("ignores focus-point field defs in a session symbol table", () => {
    const snapshot = compilePlan(
      makePlan([makeBlock("b1", 0, "focus", { symbolId: "s1" })]),
      {
        ...library,
        fieldDefs: [
          makeFieldDef({ id: "fd1", entityType: "focusPoint", key: "seed", label: "Seed" }),
        ],
        fieldValues: [
          { entityId: "s1", fieldDefId: "fd1", text: "wrong pool", revision: 0, updatedAt: 0 },
        ],
        tableViews: [makeTableView({ columnKeys: ["name", "seed"], symbolFilter: "block" })],
      },
      { now: 1, id: () => "inst1" },
    );
    expect(snapshot.blocks[0].table?.columns.map((c) => c.label)).toEqual(["Name", "seed"]);
    expect(snapshot.blocks[0].table?.rows[0]).toEqual(["Lam", ""]);
  });
});
