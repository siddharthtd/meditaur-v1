import { describe, expect, it } from "vitest";
import {
  CATALOG_BACKUP_ERRORS,
  CATALOG_BACKUP_SCHEMA_VERSION,
  parseCatalogBackup,
} from "@meditaur/application";

describe("parseCatalogBackup", () => {
  it("rejects missing collections and a newer schema", () => {
    expect(() => parseCatalogBackup(null)).toThrow(CATALOG_BACKUP_ERRORS.invalid);
    expect(() =>
      parseCatalogBackup({
        schemaVersion: 1,
        exportedAt: 1,
        workspaceId: "ws1",
      }),
    ).toThrow(CATALOG_BACKUP_ERRORS.invalid);
    expect(() =>
      parseCatalogBackup({ schemaVersion: 5 }),
    ).toThrow(CATALOG_BACKUP_ERRORS.version);
    expect(() =>
      parseCatalogBackup({
        schemaVersion: 1,
        exportedAt: 1,
        workspaceId: "ws1",
        focusPoints: [],
        symbols: [],
        affirmations: [],
        fieldDefs: [],
        fieldValues: [],
        tableViews: [],
        presets: [],
        mediaAssets: [],
        blobs: "nope",
        plans: [],
      }),
    ).toThrow(CATALOG_BACKUP_ERRORS.invalid);
  });

  it("treats a missing blobs map as empty", () => {
    expect(
      parseCatalogBackup({
        schemaVersion: 1,
        exportedAt: 1,
        workspaceId: "ws1",
        focusPoints: [],
        symbols: [],
        affirmations: [],
        fieldDefs: [],
        fieldValues: [],
        tableViews: [],
        presets: [],
        mediaAssets: [],
        plans: [],
      }).blobs,
    ).toEqual({});
  });

  it("migrates a v1 tree catalog into bindings and focus-scoped intentions", () => {
    const backup = parseCatalogBackup({
      schemaVersion: 1,
      exportedAt: 1,
      workspaceId: "ws1",
      focusPoints: [
        {
          id: "fp1",
          workspaceId: "ws1",
          name: "Root",
          kind: "chakra",
          locationText: "",
          defaultBinauralPresetId: null,
        },
      ],
      symbols: [
        {
          id: "s1",
          focusPointId: "fp1",
          name: "Lam",
          description: "",
          usage: "",
          sortOrder: 2,
        },
      ],
      affirmations: [{ id: "a1", symbolId: "s1", sortOrder: 0, text: "Ground" }],
      fieldDefs: [],
      fieldValues: [],
      tableViews: [],
      presets: [],
      mediaAssets: [],
      plans: [],
    });
    expect(backup.schemaVersion).toBe(CATALOG_BACKUP_SCHEMA_VERSION);
    expect(backup.bindings).toEqual([{ focusPointId: "fp1", symbolId: "s1", sortOrder: 2 }]);
    expect(backup.symbols[0]).toMatchObject({ id: "s1", workspaceId: "ws1", name: "Lam" });
    expect(backup.intentions[0]).toMatchObject({
      focusPointId: "fp1",
      symbolId: "s1",
      text: "Ground",
    });
    expect(backup.focusPoints[0]?.defaultDurationMs).toBe(120_000);
  });
});
