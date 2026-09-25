import { AFFIRMATION_STAGES, compilePlan, copyStages, INTENTION_STAGES, stagesDurationMs } from "@meditaur/domain";
import { describe, expect, it } from "vitest";
import {
  buildDefaultWorkspace,
  CHAKRA_DURATION_MS,
  DEFAULT_PLAN_NAME,
} from "../../../packages/db/src/default-workspace.ts";
import {
  CHAKRA_TYPE_ID,
  POINT_TYPE_ID,
  PROTECTION_TYPE_ID,
  THANKS_GIVING_TYPE_ID,
} from "@meditaur/domain";
import {
  BOUND_MEDITATION_SLOTS,
  BOUND_SYMBOL_SLOTS,
} from "../../../packages/db/src/seeded-bindings.ts";
import { nid } from "../../../packages/db/src/seeded-ids.ts";

/**
 * The seeded **chakra circuit** — the first of the two plans the seed plants, and the subject
 * of every test in this file. The points circuit (round 22) is `plans[1]` and has its own
 * suite beside the rule that builds it (`seeded-plans.test.ts`).
 */
function circuit(ws: ReturnType<typeof buildDefaultWorkspace>) {
  return ws.plans[0]!;
}

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
      ...circuit(ws).blocks[0]!,
      id: `block-${row.id}`,
      sortOrder: 0,
      meditationIds: [row.id],
      stages: copyStages(row.stages ?? []),
      binauralPresetId: row.defaultBinauralPresetId,
    },
  ];
  return compilePlan({ ...circuit(ws), blocks }, libraryOf(ws), { now: 1, id: () => "inst1" })
    .blocks[0]!;
}

describe("default workspace catalog", () => {
  it("compiles the Chakra circuit: Thanks Giving, the six chakras, Thanks Giving", () => {
    const ws = buildDefaultWorkspace("ws-test");
    const snapshot = compilePlan(circuit(ws), libraryOf(ws), { now: 1, id: () => "inst1" });
    expect(circuit(ws).name).toBe(DEFAULT_PLAN_NAME);
    expect(DEFAULT_PLAN_NAME).toBe("Chakra circuit");
    // Eight blocks, and every one is a meditation: the owner's round 15 deleted
    // cool-off, so nothing sits between them (round 15, 2026-09-19), and round 20 took
    // **Crown** out of the circuit ("Remove crown chakra from the seeded meditation plan,
    // it is not required"). The chakra's own row stays in the catalogue.
    expect(snapshot.blocks).toHaveLength(8);
    expect(snapshot.blocks.map((block) => block.meditationName)).toEqual([
      "Thanks Giving",
      "Third-Eye Chakra",
      "Throat Chakra",
      "Heart Chakra",
      "Solar Plexus",
      "Hara Chakra",
      "Root Chakra",
      "Thanks Giving",
    ]);
    // A block's length is its stages added up (§4.1): nine minutes for a chakra, and
    // Thanks Giving's one affirmations stage — a minute since round 20.
    const chakraBlockMs = stagesDurationMs(INTENTION_STAGES);
    const givingBlockMs = stagesDurationMs(AFFIRMATION_STAGES);
    expect(givingBlockMs).toBe(60_000);
    expect(snapshot.blocks.map((block) => block.durationMs)).toEqual([
      givingBlockMs,
      chakraBlockMs,
      chakraBlockMs,
      chakraBlockMs,
      chakraBlockMs,
      chakraBlockMs,
      chakraBlockMs,
      givingBlockMs,
    ]);
    // The points and Protection are rows the reader can still start, and they are
    // deliberately not in the circuit. Crown is one of them now: a meditation with no
    // block.
    expect(snapshot.blocks.some((block) => block.meditationName === "Liver")).toBe(false);
    expect(snapshot.blocks.some((block) => block.meditationName === "Crown Chakra")).toBe(false);
    expect(named(ws, "Crown Chakra").typeId).toBe(CHAKRA_TYPE_ID);
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
    const snapshot = compilePlan(circuit(ws), libraryOf(ws), { now: 1, id: () => "inst1" });
    const hz = (index: number) => {
      const binaural = snapshot.blocks[index].binaural;
      expect(binaural).toBeTruthy();
      return [binaural!.leftTones[0].hz, binaural!.rightTones[0].hz];
    };
    // The circuit opens with Thanks Giving, and an affirmations stage never plays
    // tones (§12.12) — so the first block has none at all.
    expect(snapshot.blocks[0]!.binaural).toBeNull();
    expect(hz(1)).toEqual([856, 848]);
    // Root closes the circuit now — Crown's block is gone (round 20) — before the last
    // Thanks Giving.
    expect(hz(6)).toEqual([400, 392]);
    expect(snapshot.blocks[7]!.binaural).toBeNull();
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
    const snapshot = compilePlan(circuit(ws), libraryOf(ws), { now: 1, id: () => "inst1" });
    const thirdEye = snapshot.blocks[1];
    expect(thirdEye).toBeTruthy();
    expect(thirdEye.symbolGroups.map((group) => group.name)).toEqual([
      "Harth",
      "Gnosa",
      "Shanti",
      "Kriya",
      // The four reiki symbols are bound to every chakra and every point (the owner's
      // round 21), and they follow the ones the chakra already had: an entry's
      // `sortOrder` is what a group reads in, and the round's rows were appended.
      "Hon Sha Ze Sho Nen",
      "Sei Hei Ki",
      "Cho Ku Rei",
      "Dai Kyo Mo",
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
      "Hon Sha Ze Sho Nen",
      "Sei Hei Ki",
      "Cho Ku Rei",
      "Dai Kyo Mo",
    ]);
    // The pair the seed leaves with nothing written about it still gets a group,
    // wherever the catalogue's order now puts it — that is `Liver × Kriya`.
    expect(liver.symbolGroups.find((group) => group.name === "Kriya")?.intentions).toEqual([]);
    const crown = named(ws, "Crown Chakra");
    expect(ws.entries.some((row) => row.meditationId === crown.id)).toBe(true);
    expect(ws.intentions.some((row) => row.entryId && row.text.length > 0)).toBe(true);
    expect(ws.intentions.some((row) => row.archivedAt != null)).toBe(false);
  });

  it("plants the fourteen body points the owner listed, with their sentences", () => {
    // The owner's round 21: *"Add new points: eyes, temples, ears, thyroid and thymus,
    // shoulders, tips of the lungs, liver, kidneys, pancreas and spleen, thighs, knees,
    // lower legs, ankles, soles of the feet"* — and *"Construct sentences for all of
    // these in present perfect tense"*. `Liver` and `Kidneys` were already seeded, so
    // twelve rows were added rather than fourteen; round 22 made it thirteen —
    // *"yes, they were meant as 2 different points"* — and round 25 made it fourteen with
    // the same answer about `Pancreas and spleen`: *"There should be 2 seperate points
    // called pancreas and spleen. All the records for both the points will need to be
    // created."* v32 and v34 carry the two splits.
    const ws = buildDefaultWorkspace("ws-test");
    const points = ws.meditations.filter((row) => row.typeId === POINT_TYPE_ID);
    expect(points.map((row) => row.name)).toEqual([
      "Liver",
      "Kidneys",
      "Eyes",
      "Temples",
      "Ears",
      "Thyroid",
      "Thymus",
      "Shoulders",
      "Tips of the lungs",
      "Pancreas",
      "Spleen",
      "Thighs",
      "Knees",
      "Lower legs",
      "Ankles",
      "Soles of the feet",
    ]);

    // Each one carries a place and its own sentences, on the row that names no symbol:
    // that is the row a point's intentions stage reads and the row a sheet draws "on its
    // own". Its symbols are separate rows and say nothing.
    for (const point of points) {
      expect(point.locationText, point.name).not.toBe("");
      const own = ws.entries.filter(
        (row) => row.meditationId === point.id && row.symbolId === null,
      );
      if (point.name !== "Liver" && point.name !== "Kidneys") {
        expect(own.length, `${point.name} has its own row`).toBe(1);
        const lines = ws.intentions.filter((row) => row.entryId === own[0]!.id);
        expect(lines.length, `${point.name} has sentences`).toBeGreaterThan(0);
        // The owner's example, kept word for word on the point it was written for.
        if (point.name === "Eyes") {
          expect(lines.map((row) => row.text)).toContain(
            "My eyes have been healed whole and complete. My vision has improved manifold",
          );
        }
      }
      // Every point, old and new, is bound to the four reiki symbols.
      const bound = new Set(
        ws.entries.filter((row) => row.meditationId === point.id).map((row) => row.symbolId),
      );
      for (const slot of BOUND_SYMBOL_SLOTS) {
        expect(bound.has(nid(slot)), `${point.name} is bound to ${slot.toString(16)}`).toBe(true);
      }
    }

    // And so is every chakra — seven chakras, fifteen points, four symbols each.
    const boundIds = new Set(BOUND_SYMBOL_SLOTS.map((slot) => nid(slot)));
    const bound = ws.entries.filter((row) => row.symbolId !== null && boundIds.has(row.symbolId));
    expect(bound.length).toBe(BOUND_MEDITATION_SLOTS.length * BOUND_SYMBOL_SLOTS.length);
  });

  it("mints every seeded id deterministically, so two devices agree", () => {
    // The review's seeded-id finding (2026-09-15): id-merge sync matches rows by id, so a seeded id
    // that differs per install duplicates the row instead of merging it.
    const first = buildDefaultWorkspace("ws-test");
    const second = buildDefaultWorkspace("ws-test");

    expect(second.intentions.map((row) => row.id)).toEqual(
      first.intentions.map((row) => row.id),
    );
    expect(circuit(second).blocks.map((block) => block.id)).toEqual(
      circuit(first).blocks.map((block) => block.id),
    );
    expect([
      ...first.meditations.map((row) => row.id),
      ...first.symbols.map((row) => row.id),
      ...first.presets.map((row) => row.id),
      ...first.entries.map((row) => row.id),
      ...first.intentions.map((row) => row.id),
      circuit(first).id,
    ]).toEqual([
      ...second.meditations.map((row) => row.id),
      ...second.symbols.map((row) => row.id),
      ...second.presets.map((row) => row.id),
      ...second.entries.map((row) => row.id),
      ...second.intentions.map((row) => row.id),
      circuit(second).id,
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
      circuit(first).id,
      ...circuit(first).blocks.map((block) => block.id),
    ];
    expect(everything.every((id) => id.startsWith("01900000-0000-7000-8000-"))).toBe(true);
    expect(new Set(everything).size).toBe(everything.length);
  });
});
