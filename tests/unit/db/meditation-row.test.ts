import { describe, expect, it } from "vitest";
import type { PlanBlockStage } from "@meditaur/domain";
import { makeMeditation } from "../../fixtures/library.ts";
import {
  meditationFromRow,
  meditationRow,
} from "../../../packages/db/src/meditation-row.ts";

const STAGE: PlanBlockStage = {
  key: "intentions",
  label: "Intentions",
  kind: "intentions",
  durationMs: 60_000,
  binaural: false,
  autoScroll: true,
};

describe("the meditations row", () => {
  it("speaks the stored column names rather than the domain's", () => {
    // The whole reason the pair exists, and the one thing a round-trip test cannot
    // prove on its own: a mapper that wrote `typeId` would round-trip perfectly
    // through its own reader and fail against the real table.
    const row = meditationRow(makeMeditation("fp1", "Root"));
    expect(Object.keys(row)).toContain("type_id");
    expect(Object.keys(row)).not.toContain("typeId");
    expect(Object.keys(row)).toContain("location_text");
    expect(row.binaural_enabled).toBe(true);
  });

  it("round-trips a meditation through its row unchanged", () => {
    const meditation = makeMeditation("fp1", "Root", {
      governs: "Root",
      colour: "#c0392b",
      element: "Earth",
      stages: [STAGE],
      archivedAt: 1_700_000_000_000,
      deletedAt: 1_700_000_100_000,
    });
    expect(meditationFromRow(meditationRow(meditation))).toEqual(meditation);
  });

  it("reads a row older than the column as live and on", () => {
    // A row written before `stages`, `archived_at`, `deleted_at` and
    // `binaural_enabled` existed. Absent is not a value: reading it as one would
    // archive a row in use, or silence every block that plays it.
    const row = meditationRow(makeMeditation("fp1", "Root"));
    delete row.stages;
    delete row.archived_at;
    delete row.deleted_at;
    delete row.binaural_enabled;

    const read = meditationFromRow(row);
    expect(read.archivedAt).toBeNull();
    expect(read.deletedAt).toBeNull();
    expect(read.binauralEnabled).toBe(true);
    expect(read.stages).toBeNull();
  });

  it("keeps no stages of its own apart from an empty list", () => {
    // `null` is "use the type's template" and `[]` is "runs no stages", which is
    // the distinction the tolerant read above must not collapse.
    const row = meditationRow(makeMeditation("fp1", "Root", { stages: [] }));
    expect(meditationFromRow(row).stages).toEqual([]);
    expect(meditationFromRow({ ...row, stages: null }).stages).toBeNull();
  });

  it("writes the delete mark as a timestamp, so a delete can travel", () => {
    // Slice 1's mark, as this side of it: absent means live and a timestamp means
    // gone, which is what a pull compares and a push sends on (`P2 · 3`).
    const row = meditationRow(
      makeMeditation("fp1", "Root", { deletedAt: 1_700_000_000_000 }),
    );
    expect(row.deleted_at).toBe(new Date(1_700_000_000_000).toISOString());
    expect(meditationRow(makeMeditation("fp1", "Root")).deleted_at).toBeNull();
  });
});
