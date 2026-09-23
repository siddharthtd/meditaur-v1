import { AFFIRMATION_STAGES, compilePlan, copyStages, INTENTION_STAGES, stagesDurationMs } from "@meditaur/domain";
import { describe, expect, it } from "vitest";
import {
  buildDefaultWorkspace,
  CHAKRA_DURATION_MS,
  DEFAULT_PLAN_NAME,
} from "../../../packages/db/src/default-workspace.ts";
import {
  POINT_TYPE_ID,
  PROTECTION_TYPE_ID,
  THANKS_GIVING_TYPE_ID,
} from "@meditaur/domain";

function libraryOf(ws: ReturnType<typeof buildDefaultWorkspace>) {
  return {
    meditationTypes: ws.meditationTypes,
    meditations: ws.meditations,
    symbols: ws.symbols,
    entries: ws.entries,
    intentions: ws.intentions,
    fieldDefs: ws.fieldDefs,
    fieldOptions: ws.fieldOptions,
    fieldValues: [],
    presets: ws.presets,
  };
}

function named(ws: ReturnType<typeof buildDefaultWorkspace>, name: string) {
  const row = ws.meditations.find((focus) => focus.name === name);
  expect(row).toBeTruthy();
  return row!;
}

/**
 * One meditation's block, compiled on its own.
 *
 * The seeded plan runs Thanks Giving and the seven chakras (§12.13), so a point or
 * Protection is a *row* the reader can still start — checking what it binds means
 * compiling a block of it rather than looking for it in the circuit.
 */
function blockFor(ws: ReturnType<typeof buildDefaultWorkspace>, name: string) {
  const row = named(ws, name);
  const blocks = [
    {
      ...ws.plan.blocks[0]!,
      id: `block-${row.id}`,
      sortOrder: 0,
      meditationId: row.id,
      stages: copyStages(row.stages ?? []),
      binauralPresetId: row.defaultBinauralPresetId,
    },
  ];
  return compilePlan({ ...ws.plan, blocks }, libraryOf(ws), { now: 1, id: () => "inst1" })
    .blocks[0]!;
}

describe("default workspace catalog", () => {
  it("compiles the Chakra circuit: Thanks Giving, the seven chakras, Thanks Giving", () => {
    const ws = buildDefaultWorkspace("ws-test");
    const snapshot = compilePlan(ws.plan, libraryOf(ws), { now: 1, id: () => "inst1" });
    expect(ws.plan.name).toBe(DEFAULT_PLAN_NAME);
    expect(DEFAULT_PLAN_NAME).toBe("Chakra circuit");
    // Nine blocks, and every one is a meditation: the owner's round 15 deleted
    // cool-off, so nothing sits between them (round 15, 2026-09-19).
    expect(snapshot.blocks).toHaveLength(9);
    expect(snapshot.blocks.map((block) => block.meditationName)).toEqual([
      "Thanks Giving",
      "Third-Eye Chakra",
      "Throat Chakra",
      "Heart Chakra",
      "Solar Plexus",
      "Hara Chakra",
      "Root Chakra",
      "Crown Chakra",
      "Thanks Giving",
    ]);
    // A block's length is its stages added up (§4.1): nine minutes for a chakra,
    // and Thanks Giving's one 3:00 affirmations stage.
    const chakraBlockMs = stagesDurationMs(INTENTION_STAGES);
    const givingBlockMs = stagesDurationMs(AFFIRMATION_STAGES);
    expect(snapshot.blocks.map((block) => block.durationMs)).toEqual([
      givingBlockMs,
      chakraBlockMs,
      chakraBlockMs,
      chakraBlockMs,
      chakraBlockMs,
      chakraBlockMs,
      chakraBlockMs,
      chakraBlockMs,
      givingBlockMs,
    ]);
    // The points and Protection are rows the reader can still start, and they are
    // deliberately not in the circuit.
    expect(snapshot.blocks.some((block) => block.meditationName === "Liver")).toBe(false);
    expect(named(ws, "Liver").typeId).toBe(POINT_TYPE_ID);
    expect(named(ws, "Protection").typeId).toBe(PROTECTION_TYPE_ID);
    expect(named(ws, "Thanks Giving").typeId).toBe(THANKS_GIVING_TYPE_ID);
    expect(named(ws, "Hara Chakra").defaultDurationMs).toBe(CHAKRA_DURATION_MS);
    // Thanks Giving is silent: one affirmations stage, no preset and no location.
    expect(named(ws, "Thanks Giving").defaultBinauralPresetId).toBeNull();
    expect(named(ws, "Thanks Giving").stages).toEqual(AFFIRMATION_STAGES);
  });

  it("uses solfeggio carriers and organ beats on the circuit", () => {
    const ws = buildDefaultWorkspace("ws-test");
    const snapshot = compilePlan(ws.plan, libraryOf(ws), { now: 1, id: () => "inst1" });
    const hz = (index: number) => {
      const binaural = snapshot.blocks[index].binaural;
      expect(binaural).toBeTruthy();
      return [binaural!.leftTones[0].hz, binaural!.rightTones[0].hz];
    };
    // The circuit opens with Thanks Giving, and an affirmations stage never plays
    // tones (§12.12) — so the first block has none at all.
    expect(snapshot.blocks[0]!.binaural).toBeNull();
    expect(hz(1)).toEqual([856, 848]);
    // The seventh chakra closes the circuit before the last Thanks Giving.
    expect(hz(7)).toEqual([967, 959]);
    expect(snapshot.blocks[8]!.binaural).toBeNull();
    // The organs are not in the circuit any more, but their rows keep the pairs
    // the seed gave them — 528/3.84 and 396/4.11, added about each carrier.
    const organPair = (name: string) => {
      const row = named(ws, name);
      const preset = ws.presets.find((item) => item.id === row.defaultBinauralPresetId)!;
      return [preset.leftTones[0]!.hz, preset.rightTones[0]!.hz];
    };
    expect(organPair("Liver")[0]).toBeCloseTo(529.92, 5);
    expect(organPair("Liver")[1]).toBeCloseTo(526.08, 5);
    expect(organPair("Kidneys")[0]).toBeCloseTo(398.055, 5);
    expect(organPair("Kidneys")[1]).toBeCloseTo(393.945, 5);
    expect(ws.presets.some((row) => row.name === "432 Root 256/8")).toBe(true);
    expect(named(ws, "Root Chakra").defaultBinauralPresetId).toBe(
      ws.presets.find((row) => row.name === "Solfeggio Root 396/8")?.id,
    );
  });

  it("binds all symbols including empty-intention rows and drops the Heart Harth remove line", () => {
    const ws = buildDefaultWorkspace("ws-test");
    const snapshot = compilePlan(ws.plan, libraryOf(ws), { now: 1, id: () => "inst1" });
    const thirdEye = snapshot.blocks[1];
    expect(thirdEye).toBeTruthy();
    expect(thirdEye.symbolGroups.map((group) => group.name)).toEqual([
      "Harth",
      "Gnosa",
      "Shanti",
      "Kriya",
    ]);
    expect(thirdEye.focusIntentions).toEqual([]);
    expect(thirdEye.intentions).toEqual(
      thirdEye.symbolGroups.flatMap((group) => group.intentions),
    );
    expect(thirdEye.intentions.length).toBeGreaterThan(0);
    expect(thirdEye.symbolGroups[3].intentions).toEqual([
      'My thought and intent of "becoming wealthy, being financially independent and retiring early (FIRE) and having a passive stream of income" has been manifested permanently and steadfastly',
      "SYNC-SYNC-SYNC",
    ]);
    const heart = snapshot.blocks[3];
    const harth = heart.symbolGroups.find((group) => group.name === "Harth");
    expect(harth?.intentions).toEqual([
      "All the pain, sorrow and anguish in my heart has been healed whole and complete",
      "I am receptive, stable, and balanced",
      "All my fears have been healed whole and complete.",
    ]);
    const iava = heart.symbolGroups.find((group) => group.name === "Iava");
    expect(iava?.intentions).toContain(
      "All the people unintentionally/unwantedly stuck in a <calamity> have been released, protected and saved whole and complete",
    );
    // Liver is not in the circuit any more — §12.13's plan is the chakras between
    // two Thanks Givings — so its row is asked for a block of its own.
    const liver = blockFor(ws, "Liver");
    // The symbols of a chakra come out in the catalogue's own order now — the
    // owner's round 14, "Symbols should be default sorted in this order — Harth,
    // Knosa, Halu, Iawa, Shanti, Kriya and then Zonar" — because the rows they are
    // read from are numbered that way. `Rama` is in no list, so it follows them.
    expect(liver.symbolGroups.map((group) => group.name)).toEqual([
      "Halu",
      "Iava",
      "Shanti",
      "Kriya",
      "Rama",
    ]);
    // The pair the seed leaves with nothing written about it still gets a group,
    // wherever the catalogue's order now puts it — that is `Liver × Kriya`.
    expect(liver.symbolGroups.find((group) => group.name === "Kriya")?.intentions).toEqual([]);
    const crown = named(ws, "Crown Chakra");
    expect(ws.entries.some((row) => row.meditationId === crown.id)).toBe(true);
    expect(ws.intentions.some((row) => row.entryId && row.text.length > 0)).toBe(true);
    expect(ws.intentions.some((row) => row.archivedAt != null)).toBe(false);
  });

  it("mints every seeded id deterministically, so two devices agree", () => {
    // The review's seeded-id finding (2026-09-15): id-merge sync matches rows by id, so a seeded id
    // that differs per install duplicates the row instead of merging it.
    const first = buildDefaultWorkspace("ws-test");
    const second = buildDefaultWorkspace("ws-test");

    expect(second.intentions.map((row) => row.id)).toEqual(
      first.intentions.map((row) => row.id),
    );
    expect(second.plan.blocks.map((block) => block.id)).toEqual(
      first.plan.blocks.map((block) => block.id),
    );
    expect([
      ...first.meditations.map((row) => row.id),
      ...first.symbols.map((row) => row.id),
      ...first.presets.map((row) => row.id),
      ...first.entries.map((row) => row.id),
      ...first.intentions.map((row) => row.id),
      first.plan.id,
    ]).toEqual([
      ...second.meditations.map((row) => row.id),
      ...second.symbols.map((row) => row.id),
      ...second.presets.map((row) => row.id),
      ...second.entries.map((row) => row.id),
      ...second.intentions.map((row) => row.id),
      second.plan.id,
    ]);

    // A UUID the platform generated cannot be reproduced by a second build.
    const everything = [
      ...first.meditations.map((row) => row.id),
      ...first.symbols.map((row) => row.id),
      ...first.presets.map((row) => row.id),
      ...first.fieldDefs.map((row) => row.id),
      ...first.fieldOptions.map((row) => row.id),
      ...first.entries.map((row) => row.id),
      ...first.intentions.map((row) => row.id),
      first.plan.id,
      ...first.plan.blocks.map((block) => block.id),
    ];
    expect(everything.every((id) => id.startsWith("01900000-0000-7000-8000-"))).toBe(true);
    expect(new Set(everything).size).toBe(everything.length);
  });
});
