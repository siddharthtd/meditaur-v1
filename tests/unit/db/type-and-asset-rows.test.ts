import { describe, expect, it } from "vitest";
import type { MediaAsset } from "@meditaur/domain";
import { makeMeditationType } from "../../fixtures/library.ts";
import {
  mediaAssetFromRow,
  mediaAssetRow,
} from "../../../packages/db/src/media-asset-row.ts";
import {
  meditationTypeFromRow,
  meditationTypeRow,
} from "../../../packages/db/src/meditation-type-row.ts";

const ASSET: MediaAsset = {
  id: "a1",
  workspaceId: "ws1",
  kind: "ambient",
  name: "Rain",
  storagePath: "ws1/rain.m4a",
  durationMs: 600_000,
  sortOrder: 2,
  revision: 3,
  updatedAt: 1_700_000_000_000,
  deletedAt: null,
};

describe("the type and asset rows", () => {
  it("writes a type's stored names and keeps its stages as jsonb", () => {
    const row = meditationTypeRow(makeMeditationType());
    expect(Object.keys(row)).toContain("stages");
    expect(Object.keys(row)).toContain("archived_at");
    expect(Object.keys(row)).not.toContain("sortOrder");
    expect(Array.isArray(row.stages)).toBe(true);
  });

  it("reads a type older than its columns as live, with an empty template", () => {
    // A **type** always runs stages, so `[]` is the reading that keeps a block of
    // it compiling nothing rather than refusing — which is the opposite of a
    // meditation's own copy, where absent means "ask the type" and reads as `null`.
    const row = meditationTypeRow(makeMeditationType());
    delete row.stages;
    delete row.archived_at;
    delete row.deleted_at;

    const read = meditationTypeFromRow(row);
    expect(read.stages).toEqual([]);
    expect(read.archivedAt).toBeNull();
    expect(read.deletedAt).toBeNull();
  });

  it("does not invent an archive column for a file", () => {
    // `media_assets` is the one catalogue table with no `archived_at`: a file is
    // there or gone. A pair that carried one would write a column that is not
    // there, which is a failure the round-trip below cannot see.
    const row = mediaAssetRow(ASSET);
    expect(Object.keys(row)).toContain("storage_path");
    expect(Object.keys(row)).toContain("duration_ms");
    expect(Object.keys(row)).not.toContain("storagePath");
    expect(Object.keys(row)).not.toContain("archived_at");
  });

  it("round-trips a file through its row unchanged", () => {
    expect(mediaAssetFromRow(mediaAssetRow(ASSET))).toEqual(ASSET);
  });

  it("reads a file's row without a path as one that cannot play", () => {
    const row = mediaAssetRow(ASSET);
    delete row.storage_path;
    delete row.duration_ms;
    expect(mediaAssetFromRow(row).storagePath).toBe("");
    expect(mediaAssetFromRow(row).durationMs).toBe(0);
  });
});
