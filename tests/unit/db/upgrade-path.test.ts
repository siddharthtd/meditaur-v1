import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  copyStages,
  INTENTION_STAGES,
  POINT_TYPE_ID,
  type PlanBlockStage,
} from "@meditaur/domain";
import { DEFAULT_PLAN_ID, buildDefaultWorkspace } from "../../../packages/db/src/default-workspace.ts";
import { planRowForStore } from "../../../packages/db/src/plan-mapper.ts";
import { db } from "../../../packages/db/src/schema.ts";
import { nid } from "../../../packages/db/src/seeded-ids.ts";
import { GROUP_PRESET_SLOTS, POINTS_PLAN_ID } from "../../../packages/db/src/seeded-plans.ts";
import { seededPointSlotFor } from "../../../packages/db/src/seeded-points.ts";

/**
 * The Dexie **upgrade path**, run for real — the guard the register asked for (`P2 · 43`).
 *
 * Every other suite starts from an empty database, and Dexie does not run an upgrade callback
 * when it *creates* one, so the whole path below the newest version was untested by
 * construction. It found its first real defect the hard way: round 22's v30 read `plan.blocks`
 * off a plan *row*, threw inside the upgrade, and aborted the open — a device at v29 could never
 * open the app again, and typecheck, lint and every unit test were happy. That is the class this
 * spec exists for, so it asserts the one thing a unit test of the rule cannot: **the open
 * completes**, with the repaired catalogue behind it.
 *
 * The fabrication is a real Dexie store at the *previous* version, built from the schema the
 * class itself declares — `storeMap` reads it back off an open instance rather than repeating it
 * here, because a hand-copied map is one more thing to drift. What is hand-written is the
 * **contents**: the store a device that has run v33 holds (round 24: `Pancreas and spleen` as
 * one row, the three-block points circuit), one row of each shape v34 and v35 read.
 */

/** The stores and indexes a Dexie instance is holding, as a `.stores()` map. */
function storeMap(of: Dexie): Record<string, string> {
  return Object.fromEntries(
    of.tables.map((table) => [
      table.name,
      [table.schema.primKey.src, ...table.schema.indexes.map((index) => index.src)]
        .filter((part) => part !== "")
        .join(", "),
    ]),
  );
}

/** The stages a device seeded before round 26 holds: the Declaration had not been written yet. */
function withoutDeclaration(stages: PlanBlockStage[] | null): PlanBlockStage[] | null {
  return stages?.filter((stage) => stage.key !== "declaration") ?? null;
}

/** The catalogue of a device that has run v33: no `Spleen`, and the pair written as one row. */
function asRound24() {
  const ws = buildDefaultWorkspace("ws-test");
  const spleenSlot = seededPointSlotFor("Spleen")!;
  const pancreasSlot = seededPointSlotFor("Pancreas")!;
  const thymusId = seededPointSlotFor("Thymus") === null ? null : nid(seededPointSlotFor("Thymus")!);
  const spleenId = nid(spleenSlot);
  const spleenEntryId = nid(0x500 + (spleenSlot - 0x50));
  const meditations = ws.meditations
    .filter((row) => row.id !== spleenId)
    .map((row) => {
      // No Declaration: a v33 row carries that build's own copy of its template, and this is
      // what makes the fixture a model of a real store rather than of today's seed.
      const stages = withoutDeclaration(row.stages);
      const base = { ...row, stages };
      return row.id === nid(pancreasSlot)
        ? { ...base, name: "Pancreas and spleen", locationText: "The upper abdomen" }
        : base;
    });
  const entries = ws.entries.filter(
    (row) =>
      row.meditationId !== spleenId &&
      // A device that ran v32 holds `Thymus` **without** its four symbols: the walk's own addition
      // never reached `withReikiBindings` (see `withChanges` in `schema.ts`). The fixture keeps
      // that gap, so the assertions below require v34 to close it.
      !(row.meditationId === thymusId && row.symbolId !== null),
  );
  const intentions = ws.intentions.filter((row) => row.entryId !== spleenEntryId);

  // The circuit round 22 planted: the catalogue's points five at a block, each block taking its
  // lead point's own copy of the Points template and the lead's sound.
  const points = meditations
    .filter((row) => row.typeId === POINT_TYPE_ID)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const blocks = [points.slice(0, 5), points.slice(5, 10), points.slice(10, 15)].flatMap(
    (mine, index) => {
      const lead = mine[0];
      if (!lead) return [];
      return [
        {
          id: nid(0x220 + index),
          sortOrder: index,
          stages: withoutDeclaration(copyStages(lead.stages ?? INTENTION_STAGES)) ?? [],
          meditationIds: mine.map((row) => row.id),
          symbolId: null,
          symbolScope: "all" as const,
          binauralPresetId: lead.defaultBinauralPresetId,
          ambientAssetId: null,
          alarmAssetId: null,
          alarmEnabled: null,
          display: null,
          intentionRandomiser: null,
        },
      ];
    },
  );
  const stored = ws.plans.find((row) => row.id === POINTS_PLAN_ID)!;
  const planRow = {
    id: stored.id,
    workspaceId: stored.workspaceId,
    name: stored.name,
    cycleCount: stored.cycleCount,
    cycleUntilStopped: stored.cycleUntilStopped,
    autoAdvance: stored.autoAdvance,
    alarmEnabled: stored.alarmEnabled,
    binauralEnabled: stored.binauralEnabled,
    revision: stored.revision,
    blocksJson: JSON.stringify(blocks),
    displayJson: JSON.stringify(stored.display ?? { columns: [] }),
    updatedAt: 0,
    deletedAt: null,
  };

  /**
   * The chakra circuit as the app itself wrote it, through the app's own mapper.
   *
   * Both of the things round 26 repairs are here: no Declaration in the blocks, and the alarm
   * the old default left on the plan — `false`, which is exactly the value v25 wrote into the
   * one row the app owns.
   */
  const chakra = ws.plans.find((row) => row.id === DEFAULT_PLAN_ID)!;
  const chakraRow = {
    ...planRowForStore({ ...chakra, alarmEnabled: false }),
    blocksJson: JSON.stringify(
      chakra.blocks.map((block) => ({ ...block, stages: withoutDeclaration(block.stages) ?? [] })),
    ),
  };
  /** The preference row a device seeded before round 26 holds, with the alarm's old default. */
  const preference = {
    userId: "local-dev",
    stopBinauralOnAlarm: true,
    autoAdvance: true,
    alarmEnabled: false,
    masterVolume: 0.7,
    alarmVolume: 0.6,
    ttsEnabled: false,
    textSize: "md" as const,
    theme: DEFAULT_THEME,
    lastPlanId: DEFAULT_PLAN_ID,
    revision: 0,
    updatedAt: 0,
  };

  return { ws, meditations, entries, intentions, planRow, chakraRow, preference };
}

/** A store at Dexie v33, holding round 24's catalogue, then the real open that upgrades it. */
async function fabricateThenOpen(): Promise<void> {
  db.close();
  await Dexie.delete("meditaur");

  // The map has to come from the class, and it is only readable off an open instance.
  db.close();
  await db.open();
  const stores = storeMap(db);
  db.close();
  await Dexie.delete("meditaur");

  const old = new Dexie("meditaur");
  old.version(33).stores(stores);
  await old.open();
  const { ws, meditations, entries, intentions, planRow, chakraRow, preference } = asRound24();
  await old.table("meditations").bulkPut(meditations);
  await old.table("symbols").bulkPut(ws.symbols);
  await old.table("entries").bulkPut(entries);
  await old.table("intentions").bulkPut(intentions);
  await old.table("plans").bulkPut([planRow, chakraRow]);
  await old.table("preferences").put(preference);
  await old.table("presets").bulkPut(ws.presets);
  old.close();

  // v34 splits `Pancreas and spleen`, v35 regroups the circuit, v36 is the Declaration and the
  // alarm's default. If any threw, this rejects and the open is aborted — exactly what a real
  // device would meet.
  await db.open();
}

describe("the Dexie upgrade path, from the previous version", () => {
  it("opens a v33 store, splits the point, and regroups the circuit", async () => {
    await fabricateThenOpen();

    // The split: two points, each with its own row, its own place and its own sentences.
    const allMeditations = await db.meditations.toArray();
    const points = allMeditations.filter((row) => row.typeId === POINT_TYPE_ID);
    expect(points).toHaveLength(16);
    const pancreas = points.find((row) => row.name === "Pancreas")!;
    const spleen = points.find((row) => row.name === "Spleen")!;
    expect(pancreas?.id, "the row the app wrote keeps its id").toBe(
      nid(seededPointSlotFor("Pancreas")!),
    );
    expect(spleen?.id).toBe(nid(seededPointSlotFor("Spleen")!));
    expect(pancreas.locationText).toBe("The upper abdomen, behind the stomach");
    expect(spleen.locationText).toBe("The upper left abdomen");

    const allEntries = await db.entries.toArray();
    const ownLines = async (id: string) => {
      const own = allEntries.filter((row) => row.meditationId === id && row.symbolId === null);
      expect(own).toHaveLength(1);
      const lines = (await db.intentions.toArray()).filter((row) => row.entryId === own[0]!.id);
      return lines.sort((a, b) => a.sortOrder - b.sortOrder).map((row) => row.text);
    };
    expect(await ownLines(pancreas.id)).toEqual([
      "My pancreas has been healed whole and complete",
      "My digestion and my blood sugar have settled into a calm and steady balance",
    ]);
    expect(await ownLines(spleen.id)).toEqual([
      "My spleen has been healed whole and complete",
      "My immunity is strong and quiet, and my blood is clean",
    ]);
    // And every one of them carries the four reiki bindings, like every other point — including
    // the `Thymus` the shipped v32 left without them.
    for (const name of ["Pancreas", "Spleen", "Thymus"]) {
      const point = points.find((other) => other.name === name)!;
      const bound = allEntries
        .filter((other) => other.meditationId === point.id && other.symbolId !== null)
        .map((other) => other.symbolId)
        .sort();
      expect(bound, `${name}'s four symbols`).toEqual([nid(0x38), nid(0x39), nid(0x3a), nid(0x3b)]);
    }

    // The regroup: the owner's five groups, with the circuit's own timers and one tone each —
    // behind the Thanks Giving blocks that open and close it (round 26).
    const row = (await db.plans.toArray()).find((plan) => plan.id === POINTS_PLAN_ID)!;
    const blocks = JSON.parse(row.blocksJson) as {
      meditationIds: string[];
      stages: { key: string; durationMs: number }[];
      binauralPresetId: string | null;
      alarmEnabled: boolean | null;
    }[];
    expect(blocks.map((block) => block.meditationIds.length)).toEqual([1, 3, 4, 4, 3, 2, 1]);
    expect(
      blocks.map(
        (block) => block.stages.reduce((total, stage) => total + stage.durationMs, 0) / 1000,
      ),
    ).toEqual([70, 310, 370, 370, 310, 310, 70]);
    expect(blocks.map((block) => block.binauralPresetId)).toEqual([
      null,
      ...GROUP_PRESET_SLOTS.map((slot) => (slot == null ? null : nid(slot))),
      null,
    ]);
    // The plan's own row is untouched by the regroup.
    expect(row.name).toBe("Points circuit");
    expect(row.revision).toBe(0);

    db.close();
  });

  it("gives every stage list a Declaration, and turns the alarm's default back on", async () => {
    await fabricateThenOpen();

    // The Declaration leads every row that carries stages of its own: the meditations, and the
    // blocks of **both** plans — a block carries the template materialised rather than a
    // reference to it, so repairing a type or a meditation does not reach a plan.
    const meditations = await db.meditations.toArray();
    const staged = meditations.filter((row) => (row.stages?.length ?? 0) > 0);
    expect(staged.length).toBeGreaterThan(0);
    for (const row of staged) {
      expect(row.stages?.[0]?.key, `${row.name} leads with the Declaration`).toBe("declaration");
      expect(row.stages?.[0]?.durationMs).toBe(10_000);
      expect(row.stages?.filter((stage) => stage.key === "declaration")).toHaveLength(1);
    }
    const planRows = await db.plans.toArray();
    const json = (id: string) =>
      JSON.parse(
        planRows.find((plan) => plan.id === id)!.blocksJson,
      ) as { stages: { key: string }[]; alarmEnabled: boolean | null }[];
    // The chakra circuit's blocks were repaired too, and it is the one the reader's own plans
    // resemble most closely: a plan is not a reference to its type.
    const chakra = json(DEFAULT_PLAN_ID);
    expect(chakra.map((block) => block.stages[0]?.key)).toEqual(
      chakra.map(() => "declaration"),
    );
    // The alarm's default is on again — and only on the two rows the app itself writes. The
    // circuit's Thanks Giving blocks keep the `false` the seed gives them.
    expect(planRows.find((plan) => plan.id === DEFAULT_PLAN_ID)?.alarmEnabled).toBe(true);
    expect((await db.preferences.toArray())[0]?.alarmEnabled).toBe(true);
    const circuit = json(POINTS_PLAN_ID);
    expect(circuit[0]?.alarmEnabled).toBe(false);
    expect(circuit.at(-1)?.alarmEnabled).toBe(false);

    db.close();
  });
});
