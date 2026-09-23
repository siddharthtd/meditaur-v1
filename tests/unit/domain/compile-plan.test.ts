import { describe, expect, it } from "vitest";
import {
  compilePlan,
  MAX_TONES_PER_EAR,
  SNAPSHOT_SCHEMA_VERSION,
  type CompiledSymbolGroup,
} from "@meditaur/domain";
import {
  makeBlock,
  makeEntries,
  makeFieldDef,
  makeIntention,
  makeMeditation,
  makeMeditationType,
  makeLibrary,
  makePlan,
  makeSymbol,
  stageFixture,
} from "../../fixtures/library.ts";

const library = makeLibrary();

/** The parts of a group a test is usually about: who it is and what it says. */
function groupShape(group: CompiledSymbolGroup): { name: string; intentions: string[] } {
  return { name: group.name, intentions: group.intentions };
}

describe("compilePlan", () => {
  it("assigns the next symbol on a meditation when symbolId is null", () => {
    const snapshot = compilePlan(
      makePlan([
        makeBlock("b1", 0),
        // A block with **no preset** is silent; there is no cool-off block to be
        // the silent one any more (the owner's round 15).
        makeBlock("b2", 1, { binauralPresetId: null }),
        makeBlock("b3", 2),
      ]),
      library,
      { now: 1, id: () => "inst1" },
    );
    expect(snapshot.blocks[0].symbolName).toBe("Lam");
    expect(snapshot.blocks[0].intentions).toEqual(["I am grounded", "I am safe"]);
    expect(snapshot.blocks[1].binaural).toBeNull();
    expect(snapshot.blocks[2].symbolName).toBe("Lam");
    expect(snapshot.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
  });

  it("compiles every symbol in play when symbolScope is all", () => {
    const snapshot = compilePlan(
      makePlan([
        makeBlock("b1", 0, { symbolId: null, symbolScope: "all" }),
      ]),
      makeLibrary({
        ...makeEntries([
          { meditationId: "fp1", symbolId: null, texts: ["I arrive"] },
          { meditationId: "fp1", symbolId: "s1", texts: ["I am grounded", "I am safe"] },
          { meditationId: "fp1", symbolId: "s2", texts: ["Body is home"] },
          { meditationId: "fp2", symbolId: "s1", texts: ["Heart Lam line"] },
        ]),
      }),
      { now: 1, id: () => "inst1" },
    );
    const block = snapshot.blocks[0];
    expect(block.symbolName).toBeNull();
    expect(block.intentions).toEqual(["I arrive", "I am grounded", "I am safe", "Body is home"]);
    // The chakra's own lines have no symbol box of their own: they are the lines of
    // the row that names the chakra and nothing else.
    expect(block.focusIntentions).toEqual(["I arrive"]);
    expect(block.symbolGroups.map(groupShape)).toEqual([
      { name: "Lam", intentions: ["I am grounded", "I am safe"] },
      { name: "Earth", intentions: ["Body is home"] },
    ]);
  });

  it("carries each symbol's picture into its group, and null when it has none", () => {
    const snapshot = compilePlan(
      makePlan([makeBlock("b1", 0, { symbolId: null, symbolScope: "all" })]),
      makeLibrary({
        symbols: [
          makeSymbol("s1", "Lam", { imageAssetId: "asset-lam" }),
          makeSymbol("s2", "Earth"),
        ],
        ...makeEntries([
          { meditationId: "fp1", symbolId: "s1", texts: ["I am grounded"] },
          { meditationId: "fp1", symbolId: "s2", texts: ["Body is home"] },
        ]),
      }),
      { now: 1, id: () => "inst1" },
    );

    expect(snapshot.blocks[0].symbolGroups.map((group) => group.imageAssetId)).toEqual([
      "asset-lam",
      null,
    ]);
    // The picture travels with the group even for a single-symbol block.
    const single = compilePlan(
      makePlan([makeBlock("b1", 0, { symbolId: "s1" })]),
      makeLibrary({
        symbols: [makeSymbol("s1", "Lam", { imageAssetId: "asset-lam" })],
        ...makeEntries([{ meditationId: "fp1", symbolId: "s1", texts: ["I am grounded"] }]),
      }),
      { now: 1, id: () => "inst1" },
    );
    expect(single.blocks[0].symbolGroups[0]?.imageAssetId).toBe("asset-lam");
    expect(single.blocks[0].symbolGroups[0]?.intentions).toEqual(["I am grounded"]);
  });

  it("uses the pair's own lines for the current chakra when a symbol is shared", () => {
    const snapshot = compilePlan(
      makePlan([makeBlock("b1", 0, { meditationId: "fp2", symbolId: "s1" })]),
      makeLibrary({
        meditations: [makeMeditation("fp1", "Root"), makeMeditation("fp2", "Heart")],
        symbols: [makeSymbol("s1", "Lam")],
        ...makeEntries([
          { meditationId: "fp1", symbolId: "s1", texts: ["Root Lam"] },
          { meditationId: "fp2", symbolId: "s1", texts: ["Heart Lam"] },
        ]),
      }),
      { now: 1, id: () => "inst1" },
    );
    expect(snapshot.blocks[0].symbolName).toBe("Lam");
    expect(snapshot.blocks[0].intentions).toEqual(["Heart Lam"]);
    expect(snapshot.blocks[0].symbolGroups[0]?.intentions).toEqual(["Heart Lam"]);
  });

  it("deep-copies tone lists and EQ into the snapshot", () => {
    const snapshot = compilePlan(makePlan([makeBlock("b1", 0)]), library, {
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
      compilePlan(makePlan([makeBlock("b1", 0)]), { ...library, presets }),
    ).toThrow(/16/);
  });

  it("applies durationOverrideMs to every stage without reading a public env flag", () => {
    const snapshot = compilePlan(
      makePlan([
        makeBlock("b1", 0, { durationMs: 120_000 }),
        // Two stages, so the override can be seen to shorten *each* of them rather
        // than replacing the block: a suite that lost the stages would not be
        // testing the session the app actually runs.
        makeBlock("b2", 1, {
          stages: [stageFixture(30_000), stageFixture(30_000, { key: "second" })],
        }),
      ]),
      library,
      { now: 1, id: () => "inst1", durationOverrideMs: 200 },
    );
    // Every stage runs 200 ms, so the block of one stage is 200 and the block of two
    // is 400 — the stages survive the shortening.
    expect(snapshot.blocks.map((block) => block.durationMs)).toEqual([200, 400]);
  });

  it("gives a block no stages of its own the ones its type's template names", () => {
    // The block is the shape a plan written before stages reads as: it names a
    // meditation and carries nothing else, so compile materialises the template.
    const block = { ...makeBlock("b1", 0), stages: [] };
    const types = [
      makeMeditationType({
        stages: [
          stageFixture(120_000, {
            key: "intentions",
            label: "Intentions",
            kind: "intentions",
            binaural: false,
            autoScroll: true,
          }),
          stageFixture(60_000, { key: "symbols", label: "Symbols", kind: "symbols" }),
        ],
      }),
    ];
    const snapshot = compilePlan(makePlan([block]), {
      ...library,
      meditationTypes: types,
      meditations: [makeMeditation("fp1", "Root", { stages: null })],
    });
    expect(snapshot.blocks[0]?.stages.map((stage) => stage.key)).toEqual([
      "intentions",
      "symbols",
    ]);
    // And the block's length is their sum, computed once — 3:00, not the fixture's
    // 1:00.
    expect(snapshot.blocks[0]?.durationMs).toBe(180_000);
  });

  it("carries the meditation's type name, so the session can head itself with it", () => {
    // §6.1: the session's meditation panel shows the meditation over its **type**,
    // the same pair a plan card's handle shows. The type is a row the reader can
    // rename, so the name is taken at compile time and the snapshot keeps it.
    const snapshot = compilePlan(makePlan([makeBlock("b1", 0)]), {
      ...library,
      meditationTypes: [makeMeditationType({ id: "ct1", name: "Chakras" })],
    });
    expect(snapshot.blocks[0]?.meditationTypeName).toBe("Chakras");
    // A block whose meditation is archived — or whose type row is gone — names no
    // type, and the panel falls back to the meditation alone.
    const untyped = compilePlan(makePlan([makeBlock("b1", 0)]), {
      ...library,
      meditationTypes: [],
    });
    expect(untyped.blocks[0]?.meditationTypeName).toBeNull();
  });

  it("gives an affirmations stage the sentences of the block's own meditation", () => {
    // The owner's round 16, §2.1 and §4: a stage reads the sentences written about
    // the block's **own** meditation — every row of it, in `sortOrder`, and the
    // sentences in theirs. It used to read every affirmation in the workspace, which
    // is what showed "Nothing for this stage" over a sentence the reader had written
    // on a Protection + Zonar row.
    const { entries, intentions } = makeEntries([
      { meditationId: "fp1", symbolId: null, texts: ["Body is home", "   "] },
      { meditationId: "fp1", symbolId: "s2", texts: ["I am grounded"] },
    ]);
    const snapshot = compilePlan(
      makePlan([
        makeBlock("b1", 0, {
          stages: [
            stageFixture(180_000, {
              key: "affirmations",
              label: "Affirmations",
              kind: "affirmations",
              binaural: false,
              autoScroll: true,
            }),
          ],
        }),
        makeBlock("b2", 1),
      ]),
      makeLibrary({
        entries,
        intentions: [
          ...intentions,
          // An archived sentence is not one a session reads.
          makeIntention("i-archived", "Archived", {
            entryId: entries[0]!.id,
            sortOrder: 2,
            archivedAt: 7,
          }),
          // A sentence written about nothing is nobody's, so no block reads it.
          makeIntention("i-orphan", "Nobody's"),
        ],
      }),
      { now: 1, id: () => "inst1" },
    );
    // The blank sentence is dropped, the archived one and the orphan with it, and
    // the two rows read in their own order.
    expect(snapshot.blocks[0]?.affirmations).toEqual(["Body is home", "I am grounded"]);
    // A block with no affirmations stage carries none, even though the catalogue
    // has sentences.
    expect(snapshot.blocks[1]?.affirmations).toEqual([]);
  });

  it("does not read another meditation's sentences, symbol rows included", () => {
    // The guard this round exists for. Two meditations both carry sentences around
    // the one block, and one of them sits on a **symbol-carrying** row: the pair is a
    // real row (§2.2), and a sentence written about a chakra and its symbol is the
    // chakra's own, not another chakra's — nor the whole workspace's.
    const snapshot = compilePlan(
      makePlan([
        makeBlock("b1", 0, {
          meditationId: "fp1",
          stages: [
            stageFixture(180_000, {
              key: "affirmations",
              label: "Affirmations",
              kind: "affirmations",
              binaural: false,
              autoScroll: true,
            }),
          ],
        }),
      ]),
      makeLibrary({
        meditations: [makeMeditation("fp1", "Root"), makeMeditation("fp2", "Heart")],
        ...makeEntries([
          { meditationId: "fp1", symbolId: null, texts: ["Body is home"] },
          { meditationId: "fp1", symbolId: "s1", texts: ["I am grounded"] },
          { meditationId: "fp2", symbolId: "s1", texts: ["Heart Lam"] },
          { meditationId: "fp2", symbolId: null, texts: ["I am open"] },
        ]),
      }),
      { now: 1, id: () => "inst1" },
    );
    expect(snapshot.blocks[0]?.affirmations).toEqual(["Body is home", "I am grounded"]);
  });

  it("prefers a meditation's own stages to its type's template", () => {
    const block = { ...makeBlock("b1", 0), stages: [] };
    const snapshot = compilePlan(makePlan([block]), {
      ...library,
      meditationTypes: [makeMeditationType({ stages: [stageFixture(60_000)] })],
      meditations: [
        makeMeditation("fp1", "Root", {
          stages: [stageFixture(610_000, { key: "mine", label: "Mine" })],
        }),
      ],
    });
    expect(snapshot.blocks[0]?.stages.map((stage) => stage.key)).toEqual(["mine"]);
    expect(snapshot.blocks[0]?.durationMs).toBe(610_000);
  });

  it("renders the columns the plan's display shows, and only the shown ones", () => {
    const snapshot = compilePlan(
      makePlan([makeBlock("b1", 0, { symbolId: "s1" })]),
      {
        ...library,
        fieldDefs: [
          makeFieldDef({ id: "fd1", scope: "symbol", key: "notes", label: "Notes" }),
          makeFieldDef({ id: "fd2", scope: "symbol", key: "hidden", label: "Hidden" }),
        ],
        fieldValues: [
          { entityId: "s1", fieldDefId: "fd1", text: "lam", revision: 0, updatedAt: 0 },
          { entityId: "s1", fieldDefId: "fd2", text: "nope", revision: 0, updatedAt: 0 },
        ],
      },
      { now: 1, id: () => "inst1" },
    );
    const group = snapshot.blocks[0].symbolGroups[0];
    expect(group?.facts.map((fact) => fact.key)).toEqual(["description", "usage"]);
  });

  it("lets one meditation show its own columns while the plan shows others", () => {
    // The owner's round 17, item 13: the Display panel moved onto the meditation, so
    // a circuit's Thanks Giving can want different columns from its chakras. `null`
    // is a block that has never been asked, and it takes the plan's answer — which is
    // what keeps a plan nobody has edited behaving exactly as it did.
    const planned = makePlan(
      [makeBlock("b1", 0, { symbolId: "s1" }), makeBlock("b2", 1, { symbolId: "s2" })],
      { display: { columns: [{ key: "description", area: "symbol", shown: true, pinned: false }] } },
    );
    planned.blocks[1] = {
      ...planned.blocks[1]!,
      display: { columns: [{ key: "notes", area: "symbol", shown: true, pinned: false }] },
    };
    const snapshot = compilePlan(
      planned,
      {
        ...library,
        fieldDefs: [makeFieldDef({ id: "fd1", scope: "symbol", key: "notes", label: "Notes" })],
        fieldValues: [
          { entityId: "s1", fieldDefId: "fd1", text: "lam", revision: 0, updatedAt: 0 },
          { entityId: "s2", fieldDefId: "fd1", text: "earth", revision: 0, updatedAt: 0 },
        ],
      },
      { now: 1, id: () => "inst1" },
    );
    expect(snapshot.blocks[0]?.symbolGroups[0]?.facts.map((fact) => fact.key)).toEqual([
      "description",
    ]);
    expect(snapshot.blocks[1]?.symbolGroups[0]?.facts.map((fact) => fact.key)).toEqual(["notes"]);
  });

  it("resolves each block's own alarm, and the plan's for a block that says nothing", () => {
    // The other half of item 13: "a silent Thanks Giving beside a ringing chakra",
    // with the plan's switch still deciding wherever a block declines to.
    const plan = makePlan([makeBlock("b1", 0), makeBlock("b2", 1), makeBlock("b3", 2)], {
      alarmEnabled: true,
    });
    plan.blocks[0] = { ...plan.blocks[0]!, alarmEnabled: false };
    plan.blocks[2] = { ...plan.blocks[2]!, alarmEnabled: true };
    const snapshot = compilePlan(plan, library, { now: 1, id: () => "inst1" });
    expect(snapshot.blocks.map((block) => block.alarmEnabled)).toEqual([false, true, true]);

    // And with the plan's switch off, a block that says nothing is silent while the
    // one that asked for its own alarm still rings.
    const again = compilePlan(
      makePlan(
        [makeBlock("b1", 0), { ...makeBlock("b2", 1), alarmEnabled: true }],
        { alarmEnabled: false },
      ),
      library,
      { now: 1, id: () => "inst1" },
    );
    expect(again.blocks.map((block) => block.alarmEnabled)).toEqual([false, true]);
  });

  it("resolves a select and a reference cell to what the reader typed, not to its id", () => {
    const snapshot = compilePlan(
      makePlan(
        [makeBlock("b1", 0, { symbolId: "s1" })],
        {
          display: {
            columns: [
              { key: "element", area: "symbol", shown: true, pinned: false },
              { key: "pair", area: "entry", shown: true, pinned: false },
            ],
          },
        },
      ),
      {
        ...library,
        fieldDefs: [
          makeFieldDef({
            id: "fd1",
            scope: "symbol",
            key: "element",
            label: "Element",
            cellType: "select",
          }),
          makeFieldDef({
            id: "fd2",
            scope: "entry",
            key: "pair",
            label: "Pair",
            cellType: "reference",
            refKind: "symbol",
          }),
        ],
        fieldOptions: [
          { id: "opt1", workspaceId: "ws1", fieldDefId: "fd1", label: "Earth", sortOrder: 0, revision: 0, updatedAt: 0 },
        ],
        fieldValues: [
          { entityId: "s1", fieldDefId: "fd1", text: "opt1", revision: 0, updatedAt: 0 },
          {
            entityId: "e-fp1-s1",
            fieldDefId: "fd2",
            text: "s2",
            revision: 0,
            updatedAt: 0,
          },
        ],
      },
      { now: 1, id: () => "inst1" },
    );
    const group = snapshot.blocks[0].symbolGroups[0];
    expect(group?.facts).toEqual([
      { key: "element", label: "Element", value: "Earth", pinned: false },
    ]);
    // A pair's own column is a fact about the row, so it renders in that row's box.
    expect(group?.entryFacts).toEqual([
      { key: "pair", label: "Pair", value: "Earth", pinned: false },
    ]);
  });

  it("shows the chakra's own columns on the block when the plan asks for them", () => {
    const snapshot = compilePlan(
      makePlan(
        [makeBlock("b1", 0)],
        {
          display: {
            columns: [{ key: "location", area: "meditation", shown: true, pinned: true }],
          },
        },
      ),
      library,
      { now: 1, id: () => "inst1" },
    );
    expect(snapshot.blocks[0].meditationFacts).toEqual([
      { key: "location", label: "Location", value: "Root", pinned: true },
    ]);
  });

  it("carries the pin with the fact, so the session knows which columns stay put", () => {
    const snapshot = compilePlan(
      makePlan(
        [makeBlock("b1", 0, { symbolId: "s1" })],
        {
          display: {
            columns: [
              { key: "description", area: "symbol", shown: true, pinned: true },
              { key: "usage", area: "symbol", shown: true, pinned: false },
            ],
          },
        },
      ),
      library,
      { now: 1, id: () => "inst1" },
    );
    expect(snapshot.blocks[0].symbolGroups[0]?.facts.map((fact) => [fact.key, fact.pinned])).toEqual(
      [
        ["description", true],
        ["usage", false],
      ],
    );
  });

  it("leaves out a fact whose value is empty rather than printing a bare heading", () => {
    const snapshot = compilePlan(
      makePlan(
        [makeBlock("b1", 0, { symbolId: "s1" })],
        {
          display: { columns: [{ key: "notes", area: "symbol", shown: true, pinned: false }] },
        },
      ),
      {
        ...library,
        fieldDefs: [makeFieldDef({ id: "fd1", scope: "symbol", key: "notes", label: "Notes" })],
        fieldValues: [],
      },
      { now: 1, id: () => "inst1" },
    );
    expect(snapshot.blocks[0].symbolGroups[0]?.facts).toEqual([]);
  });

  it("keeps a focus-point column out of a symbol's facts when both tables use the key", () => {
    const snapshot = compilePlan(
      makePlan(
        [makeBlock("b1", 0, { symbolId: "s1" })],
        {
          display: { columns: [{ key: "notes", area: "symbol", shown: true, pinned: false }] },
        },
      ),
      {
        ...library,
        fieldDefs: [
          makeFieldDef({ id: "fd2", scope: "meditation", key: "notes", label: "Notes" }),
          makeFieldDef({ id: "fd1", scope: "symbol", key: "notes", label: "Notes" }),
        ],
        fieldValues: [
          // A value typed into the chakra's `notes`, which the symbol's column must
          // not pick up: the scope is what says which table a value belongs to.
          { entityId: "fp1", fieldDefId: "fd2", text: "wrong pool", revision: 0, updatedAt: 0 },
        ],
      },
      { now: 1, id: () => "inst1" },
    );
    expect(snapshot.blocks[0].symbolGroups[0]?.facts).toEqual([]);
  });

  it("keeps binaural when both the plan and the meditation allow it", () => {
    const snapshot = compilePlan(makePlan([makeBlock("b1", 0)]), library, {
      now: 1,
      id: () => "inst1",
    });
    expect(snapshot.blocks[0].binaural).not.toBeNull();
    expect(snapshot.blocks[0].binaural?.leftTones.length).toBeGreaterThan(0);
  });

  it("skips binaural when the plan toggle is off", () => {
    const snapshot = compilePlan(
      makePlan([makeBlock("b1", 0)], { binauralEnabled: false }),
      library,
      { now: 1, id: () => "inst1" },
    );
    expect(snapshot.blocks[0].binaural).toBeNull();
  });

  it("skips binaural when only the meditation toggle is off", () => {
    const snapshot = compilePlan(
      makePlan([makeBlock("b1", 0)]),
      makeLibrary({
        meditations: [makeMeditation("fp1", "Root", { binauralEnabled: false })],
      }),
      { now: 1, id: () => "inst1" },
    );
    expect(snapshot.blocks[0].binaural).toBeNull();
  });
});
