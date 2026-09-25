import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import { copyStages, INTENTION_STAGES, POINT_TYPE_ID } from "@meditaur/domain";
import { buildDefaultWorkspace } from "../../../packages/db/src/default-workspace.ts";
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
    .map((row) =>
      row.id === nid(pancreasSlot)
        ? { ...row, name: "Pancreas and spleen", locationText: "The upper abdomen" }
        : row,
    );
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
          stages: copyStages(lead.stages ?? INTENTION_STAGES),
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

  return { ws, meditations, entries, intentions, planRow };
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
  const { ws, meditations, entries, intentions, planRow } = asRound24();
  await old.table("meditations").bulkPut(meditations);
  await old.table("symbols").bulkPut(ws.symbols);
  await old.table("entries").bulkPut(entries);
  await old.table("intentions").bulkPut(intentions);
  await old.table("plans").put(planRow);
  await old.table("presets").bulkPut(ws.presets);
  old.close();

  // v34 splits `Pancreas and spleen`, v35 regroups the circuit. If either threw, this rejects
  // and the open is aborted — exactly what a real device would meet.
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

    // The regroup: the owner's five groups, with the circuit's own timers and one tone each.
    const row = (await db.plans.toArray()).find((plan) => plan.id === POINTS_PLAN_ID)!;
    const blocks = JSON.parse(row.blocksJson) as {
      meditationIds: string[];
      stages: { durationMs: number }[];
      binauralPresetId: string | null;
    }[];
    expect(blocks.map((block) => block.meditationIds.length)).toEqual([3, 4, 4, 3, 2]);
    expect(
      blocks.map(
        (block) => block.stages.reduce((total, stage) => total + stage.durationMs, 0) / 60_000,
      ),
    ).toEqual([5, 6, 6, 5, 5]);
    expect(blocks.map((block) => block.binauralPresetId)).toEqual(
      GROUP_PRESET_SLOTS.map((slot) => (slot == null ? null : nid(slot))),
    );
    // The plan's own row is untouched by the regroup.
    expect(row.name).toBe("Points circuit");
    expect(row.revision).toBe(0);

    db.close();
  });
});
