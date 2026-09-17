import { compilePlan } from "@meditaur/domain";
import { describe, expect, it } from "vitest";
import {
  buildDefaultWorkspace,
  CHAKRA_DURATION_MS,
  COOLOFF_DURATION_MS,
  DEFAULT_PLAN_NAME,
  ORGAN_DURATION_MS,
  PROTECTION_DURATION_MS,
} from "../../../packages/db/src/default-workspace.ts";

function libraryOf(ws: ReturnType<typeof buildDefaultWorkspace>) {
  return {
    focusPoints: ws.focusPoints,
    symbols: ws.symbols,
    bindings: ws.bindings,
    intentions: ws.intentions,
    fieldDefs: [],
    fieldValues: [],
    tableViews: ws.tableViews,
    presets: ws.presets,
  };
}

function named(ws: ReturnType<typeof buildDefaultWorkspace>, name: string) {
  const row = ws.focusPoints.find((focus) => focus.name === name);
  expect(row).toBeTruthy();
  return row!;
}

describe("default workspace catalog", () => {
  it("compiles the circuit with solfeggio defaults and no crown block", () => {
    const ws = buildDefaultWorkspace("ws-test");
    const snapshot = compilePlan(ws.plan, libraryOf(ws), { now: 1, id: () => "inst1" });
    expect(ws.plan.name).toBe(DEFAULT_PLAN_NAME);
    expect(snapshot.blocks).toHaveLength(17);
    expect(snapshot.blocks.map((block) => block.focusPointName)).toEqual([
      "Third-Eye Chakra",
      null,
      "Throat Chakra",
      null,
      "Heart Chakra",
      null,
      "Solar Plexus",
      null,
      "Hara Chakra",
      null,
      "Root Chakra",
      null,
      "Protection",
      "Liver",
      null,
      "Kidneys",
      null,
    ]);
    expect(snapshot.blocks.map((block) => block.durationMs)).toEqual([
      CHAKRA_DURATION_MS,
      COOLOFF_DURATION_MS,
      CHAKRA_DURATION_MS,
      COOLOFF_DURATION_MS,
      CHAKRA_DURATION_MS,
      COOLOFF_DURATION_MS,
      CHAKRA_DURATION_MS,
      COOLOFF_DURATION_MS,
      CHAKRA_DURATION_MS,
      COOLOFF_DURATION_MS,
      CHAKRA_DURATION_MS,
      COOLOFF_DURATION_MS,
      PROTECTION_DURATION_MS,
      ORGAN_DURATION_MS,
      COOLOFF_DURATION_MS,
      ORGAN_DURATION_MS,
      COOLOFF_DURATION_MS,
    ]);
    expect(snapshot.blocks.some((block) => block.focusPointName === "Crown Chakra")).toBe(false);
    expect(named(ws, "Crown Chakra").kind).toBe("chakra");
    expect(named(ws, "Protection").kind).toBe("custom");
    expect(named(ws, "Hara Chakra").defaultDurationMs).toBe(CHAKRA_DURATION_MS);
  });

  it("uses solfeggio carriers and organ beats on the circuit", () => {
    const ws = buildDefaultWorkspace("ws-test");
    const snapshot = compilePlan(ws.plan, libraryOf(ws), { now: 1, id: () => "inst1" });
    const hz = (index: number) => {
      const binaural = snapshot.blocks[index].binaural;
      expect(binaural).toBeTruthy();
      return [binaural!.leftTones[0].hz, binaural!.rightTones[0].hz];
    };
    expect(hz(0)).toEqual([856, 848]);
    expect(hz(12)).toEqual([967, 959]);
    expect(hz(13)[0]).toBeCloseTo(529.92, 5);
    expect(hz(13)[1]).toBeCloseTo(526.08, 5);
    expect(hz(15)[0]).toBeCloseTo(398.055, 5);
    expect(hz(15)[1]).toBeCloseTo(393.945, 5);
    expect(ws.presets.some((row) => row.name === "432 Root 256/8")).toBe(true);
    expect(named(ws, "Root Chakra").defaultBinauralPresetId).toBe(
      ws.presets.find((row) => row.name === "Solfeggio Root 396/8")?.id,
    );
  });

  it("binds all symbols including empty-intention rows and drops the Heart Harth remove line", () => {
    const ws = buildDefaultWorkspace("ws-test");
    const snapshot = compilePlan(ws.plan, libraryOf(ws), { now: 1, id: () => "inst1" });
    const thirdEye = snapshot.blocks[0];
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
    const heart = snapshot.blocks[4];
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
    const liver = snapshot.blocks[13];
    expect(liver.symbolGroups.map((group) => group.name)).toEqual([
      "Kriya",
      "Rama",
      "Halu",
      "Iava",
      "Shanti",
    ]);
    expect(liver.symbolGroups[0].intentions).toEqual([]);
    const crown = named(ws, "Crown Chakra");
    expect(ws.bindings.some((row) => row.focusPointId === crown.id)).toBe(true);
    expect(ws.intentions.some((row) => row.focusPointId === crown.id)).toBe(false);
  });

  it("mints every seeded id deterministically, so two devices agree", () => {
    // Architectural review M4: id-merge sync matches rows by id, so a seeded id
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
      ...first.focusPoints.map((row) => row.id),
      ...first.symbols.map((row) => row.id),
      ...first.presets.map((row) => row.id),
      ...first.intentions.map((row) => row.id),
      first.plan.id,
      first.tableViews[0].id,
    ]).toEqual([
      ...second.focusPoints.map((row) => row.id),
      ...second.symbols.map((row) => row.id),
      ...second.presets.map((row) => row.id),
      ...second.intentions.map((row) => row.id),
      second.plan.id,
      second.tableViews[0].id,
    ]);

    // A UUID the platform generated cannot be reproduced by a second build.
    const everything = [
      ...first.focusPoints.map((row) => row.id),
      ...first.symbols.map((row) => row.id),
      ...first.presets.map((row) => row.id),
      ...first.bindings.map((row) => `${row.focusPointId}:${row.symbolId}`),
      ...first.intentions.map((row) => row.id),
      first.plan.id,
      ...first.plan.blocks.map((block) => block.id),
      first.tableViews[0].id,
    ];
    expect(everything.every((id) => id.startsWith("01900000-0000-7000-8000-"))).toBe(true);
    expect(new Set(everything).size).toBe(everything.length);
  });
});
