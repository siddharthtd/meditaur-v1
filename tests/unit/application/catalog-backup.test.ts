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
    // Read the constant, never a literal: a hardcoded number here silently
    // stops testing "a newer file" the moment the schema is bumped, and starts
    // testing "a malformed current file" instead.
    expect(() =>
      parseCatalogBackup({ schemaVersion: CATALOG_BACKUP_SCHEMA_VERSION + 1 }),
    ).toThrow(CATALOG_BACKUP_ERRORS.version);
    expect(() =>
      parseCatalogBackup({
        schemaVersion: 1,
        exportedAt: 1,
        workspaceId: "ws1",
        meditations: [],
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
        meditations: [],
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

  it("reads the affirmations table a v9 file carries, and a v1 file's lines as lines", () => {
    // `affirmations` is a key this file has used for two different things: up to v5
    // it held the reader's **lines**, which are `intentions` now, and 9 brought a
    // table of the same name. The version is what tells them apart — and a v9 row
    // is an **orphan**: the owner's round 16, §2.1 merged that table into the
    // sentences, so a sentence that names nothing is what it reads as.
    const current = parseCatalogBackup({
      schemaVersion: CATALOG_BACKUP_SCHEMA_VERSION,
      exportedAt: 1,
      workspaceId: "ws1",
      meditations: [],
      symbols: [],
      entries: [],
      intentions: [],
      affirmations: [
        { id: "af1", workspaceId: "ws1", text: "I am calm", sortOrder: 0 },
        { id: "af2", workspaceId: "ws1", text: "I am here", sortOrder: 1 },
      ],
      fieldDefs: [],
      fieldOptions: [],
      fieldValues: [],
      presets: [],
      mediaAssets: [],
      blobs: {},
      plans: [],
    });
    expect(current.intentions).toEqual([
      {
        id: "af1",
        workspaceId: "ws1",
        entryId: null,
        text: "I am calm",
        sortOrder: 0,
        archivedAt: null,
        revision: 0,
        updatedAt: 0,
      },
      {
        id: "af2",
        workspaceId: "ws1",
        entryId: null,
        text: "I am here",
        sortOrder: 1,
        archivedAt: null,
        revision: 0,
        updatedAt: 0,
      },
    ]);
  });

  it("treats a file written before history was included as having none", () => {
    // v4 predates `logs`. An absent key means none, the same rule as the missing
    // `blobs` map above — an old backup has to keep restoring.
    expect(
      parseCatalogBackup({
        schemaVersion: 4,
        exportedAt: 1,
        workspaceId: "ws1",
        meditations: [],
        symbols: [],
        intentions: [],
        fieldDefs: [],
        fieldValues: [],
        tableViews: [],
        presets: [],
        mediaAssets: [],
        plans: [],
      }).logs,
    ).toEqual([]);
  });

  it("migrates a v1 tree catalog into rows, and points its lines at them", () => {
    const backup = parseCatalogBackup({
      schemaVersion: 1,
      exportedAt: 1,
      workspaceId: "ws1",
      // The keys and fields are the ones a file of that age really carried:
      // `focusPoints`, `focusPointId`. Reading a v1 file written with the new words
      // would prove nothing about the reader.
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
      presets: [],
      mediaAssets: [],
      plans: [],
    });
    expect(backup.schemaVersion).toBe(CATALOG_BACKUP_SCHEMA_VERSION);
    // The pair the v1 file only implied — a symbol's chakra and an affirmation's
    // symbol — becomes the row the line belongs to, and the row's id is derived
    // from the pair so restoring the same file twice does not double it.
    expect(backup.entries).toHaveLength(1);
    expect(backup.entries[0]).toMatchObject({
      meditationId: "fp1",
      symbolId: "s1",
      // The symbol's stored order was the association's order in that file, so the
      // row keeps it rather than starting from zero.
      sortOrder: 2,
      archivedAt: null,
    });
    expect(backup.symbols[0]).toMatchObject({ id: "s1", workspaceId: "ws1", name: "Lam" });
    expect(backup.intentions[0]).toMatchObject({
      entryId: backup.entries[0]?.id,
      text: "Ground",
    });
    expect(backup.meditations[0]?.defaultDurationMs).toBe(120_000);
    // A v1 file's `affirmations` key is its **lines**, not the table a v9 file
    // carries under the same name. Reading them twice would double every intention
    // as a sentence the reader never wrote — and with the two merged, that would
    // show up here as a second row rather than a second list.
    expect(backup.intentions).toHaveLength(1);

    const again = parseCatalogBackup({
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
      symbols: [{ id: "s1", focusPointId: "fp1", name: "Lam", description: "", usage: "" }],
      affirmations: [{ id: "a1", symbolId: "s1", sortOrder: 0, text: "Ground" }],
      fieldDefs: [],
      fieldValues: [],
      presets: [],
      mediaAssets: [],
      plans: [],
    });
    expect(again.entries[0]?.id).toBe(backup.entries[0]?.id);
  });

  it("reads a version-5 file's bindings and pair-scoped lines as rows", () => {
    const backup = parseCatalogBackup({
      schemaVersion: 5,
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
      symbols: [{ id: "s1", workspaceId: "ws1", name: "Lam", description: "", usage: "" }],
      bindings: [{ focusPointId: "fp1", symbolId: "s1", sortOrder: 3 }],
      intentions: [
        {
          id: "a1",
          workspaceId: "ws1",
          focusPointId: "fp1",
          symbolId: "s1",
          sortOrder: 0,
          text: "Ground",
        },
        // A line that pointed at nothing keeps its own row: the owner's round 16
        // merged the affirmations into the lines, so a sentence about nothing is
        // the orphan the Affirmations table shows rather than a row to drop.
        { id: "a2", workspaceId: "ws1", focusPointId: null, symbolId: null, sortOrder: 1, text: "x" },
      ],
      fieldDefs: [
        {
          id: "fd1",
          workspaceId: "ws1",
          entityType: "focusPoint",
          key: "element",
          label: "Element",
          sortOrder: 0,
        },
      ],
      fieldValues: [],
      tableViews: [{ id: "v1", workspaceId: "ws1", name: "Old", columnKeys: ["name"] }],
      presets: [],
      mediaAssets: [],
      plans: [],
    });
    expect(backup.entries).toHaveLength(1);
    expect(backup.entries[0]).toMatchObject({ meditationId: "fp1", symbolId: "s1", sortOrder: 3 });
    // Both lines come through, in the file's order: the one written about the pair
    // points at the row derived for it, and the one about nothing is an orphan.
    expect(backup.intentions).toHaveLength(2);
    expect(backup.intentions[0]?.entryId).toBe(backup.entries[0]?.id);
    expect(backup.intentions[1]).toMatchObject({ id: "a2", entryId: null, text: "x" });
    // And no row is derived for a pair of two nulls: "nothing chosen" is not a row.
    expect(backup.entries.some((row) => !row.meditationId && !row.symbolId)).toBe(false);
    // `entityType` reads as a scope, and a column that never held a type is text.
    expect(backup.fieldDefs[0]).toMatchObject({ scope: "meditation", cellType: "text" });
    expect(backup.fieldOptions).toEqual([]);
  });

  it("reads a v7 file, whose words the rename has since replaced", () => {
    // Round 15's rename (2026-09-19): `focusPoints` became `meditations` and `focusPointId` became
    // `meditationId`. A file from just before that move is the likeliest one a
    // reader still holds, so every one of its old words has to be read — the key,
    // the entry's field, and both stored unions.
    const backup = parseCatalogBackup({
      schemaVersion: 7,
      exportedAt: 1,
      workspaceId: "ws1",
      focusPoints: [
        {
          id: "fp1",
          workspaceId: "ws1",
          name: "Root",
          typeId: "ct-chakra",
          locationText: "Base",
          defaultBinauralPresetId: null,
        },
      ],
      entries: [
        {
          id: "e1",
          workspaceId: "ws1",
          focusPointId: "fp1",
          symbolId: "s1",
          sortOrder: 0,
          archivedAt: null,
        },
      ],
      intentions: [
        { id: "i1", workspaceId: "ws1", entryId: "e1", sortOrder: 0, text: "Ground" },
      ],
      symbols: [{ id: "s1", workspaceId: "ws1", name: "Lam", description: "", usage: "" }],
      fieldDefs: [
        {
          id: "fd1",
          workspaceId: "ws1",
          scope: "focusPoint",
          key: "element",
          label: "Element",
          sortOrder: 0,
        },
        {
          id: "fd2",
          workspaceId: "ws1",
          scope: "entry",
          refKind: "focusPoint",
          key: "points-at",
          label: "Points at",
          sortOrder: 1,
        },
      ],
      fieldValues: [],
      presets: [],
      mediaAssets: [],
      plans: [],
    });
    expect(backup.meditations).toHaveLength(1);
    expect(backup.meditations[0]).toMatchObject({ id: "fp1", typeId: "ct-chakra" });
    expect(backup.entries[0]).toMatchObject({ meditationId: "fp1", symbolId: "s1" });
    expect(backup.fieldDefs).toMatchObject([
      { scope: "meditation", refKind: null },
      { scope: "entry", refKind: "meditation" },
    ]);
  });

  it("gives a symbol with no reiki system the one system the app shipped", () => {
    // A v9 file predates the field — `Symbol.reikiSystem` arrived with the owner's
    // round 16 — so its rows name no system, and every symbol that existed then was a
    // Karuna Reiki symbol, because there was one system. Reading it as anything else
    // would hide a restored catalogue the moment the flag turned that system off.
    const backup = parseCatalogBackup({
      schemaVersion: 9,
      exportedAt: 1,
      workspaceId: "ws1",
      meditations: [],
      meditationTypes: [],
      entries: [],
      intentions: [],
      symbols: [
        { id: "s1", workspaceId: "ws1", name: "Zonar", description: "", usage: "" },
        // A file this version exported says what it means, and a restore keeps it.
        {
          id: "s2",
          workspaceId: "ws1",
          name: "Sei Hei Ki",
          description: "",
          usage: "",
          reikiSystem: "usui_reiki",
        },
      ],
      fieldDefs: [],
      fieldValues: [],
      presets: [],
      mediaAssets: [],
      plans: [],
    });
    expect(backup.symbols.map((row) => [row.name, row.reikiSystem])).toEqual([
      ["Zonar", "karuna_reiki"],
      ["Sei Hei Ki", "usui_reiki"],
    ]);
  });
});
