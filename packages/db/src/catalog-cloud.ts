import {
  type CatalogRepository,
  type Clock,
  type Entry,
  type FieldOption,
  type FieldValue,
  type Intention,
  type MediaAsset,
  type Meditation,
  type MeditationType,
  type Symbol,
} from "@meditaur/domain";
import { entryFromRow, entryRow, intentionFromRow, intentionRow } from "./catalogue-rows.ts";
import { symbolFromRow, symbolRow } from "./catalogue-rows.ts";
import { fieldDefFromRow, fieldDefRow } from "./field-def-row.ts";
import {
  fieldOptionFromRow,
  fieldOptionRow,
  fieldValueFromRow,
  fieldValueRow,
} from "./field-rows.ts";
import { mediaAssetFromRow, mediaAssetRow } from "./media-asset-row.ts";
import { meditationFromRow, meditationRow } from "./meditation-row.ts";
import { meditationTypeFromRow, meditationTypeRow } from "./meditation-type-row.ts";
import { presetFromRow } from "./preset-row.ts";
import { liveRows, markRowDeleted } from "./row-mark.ts";
import type { SupabaseDataLike } from "./supabase.ts";

/**
 * `CatalogRepository` over the cloud's catalogue tables — item 3's slice 2, the
 * adapter half.
 *
 * It takes an **injected** `SupabaseDataLike` rather than constructing a client, so
 * `supabase.ts` stays the only module that imports the SDK and the one-client rule
 * holds: a second client would be a signed-in app whose own catalogue is invisible to
 * it, because RLS reads the session on the client. Every unit test here drives a fake
 * through the same interface.
 *
 * Three things about the shape are decisions rather than mechanics.
 *
 * **A save is one upsert.** Sync settles last-write-wins with no conflict screen
 * (`DECISIONS.md` §7), so a row carries everything it needs and there is nothing to
 * compare — the compare-and-swap belongs to preferences, whose save is a different
 * operation wearing the same name.
 *
 * **A delete is a write.** Slice 1 gave these ten tables a delete mark precisely so
 * that a delete could travel (`20260921140000_sync_delete_marks.sql`): the row is
 * read, marked, and re-written one revision on. It is deliberately *not* a removal,
 * because an absence cannot travel — the other device would read the missing row as
 * new and pull it back.
 *
 * **A cascade is written as marks, because the server's foreign keys will not fire.**
 * Postgres deletes a row's lines with it (`on delete cascade`), but that only happens
 * on a real `delete`, and this adapter never issues one. So `deleteEntry` marks the
 * entry *and* its lines: otherwise the lines would travel as live rows pointing at a
 * marked entry, and the local store — which had deleted them — would take them back
 * on the next pull.
 *
 * The plan repository is deliberately **not** here yet, and the reason is in the
 * register: neither `plans` nor `plan_blocks` carries a delete mark (slice 1 left
 * them out on purpose, and `plan_blocks` has no `revision` or `updated_at` either), so
 * a deleted plan and a removed block cannot travel as writes. That is a decision to
 * take before a plan adapter is written, not a coding gap.
 */
export function createCloudCatalogPort(input: {
  client: SupabaseDataLike;
  clock: Clock;
}): CatalogRepository {
  const { client, clock } = input;

  const TABLE = {
    meditationTypes: "meditation_types",
    meditations: "meditations",
    symbols: "symbols",
    entries: "entries",
    intentions: "intentions",
    fieldDefs: "field_defs",
    fieldOptions: "field_options",
    fieldValues: "field_values",
    mediaAssets: "media_assets",
    presets: "binaural_presets",
  } as const;

  /**
   * One table's rows for a workspace, as the store holds them — **minus the marked
   * ones**.
   *
   * A delete here is a write (`markDeleted` below), so the read has to undo it, or the
   * row a reader removed comes back on the next load. The plan adapter's reads did this
   * from the day they landed and these did not, which is the kind of half-applied rule
   * `DECISIONS.md` §12 is about: one seam per rule, or two stores disagree about what a
   * row is.
   */
  async function rowsOf(table: string, workspaceId: string): Promise<Record<string, unknown>[]> {
    return liveRows(await client.select(table, "workspace_id", workspaceId, "*"));
  }

  /**
   * A delete, as the mark. The row is read first because a delete names an id and
   * nothing else: the mark has to land on the row's own revision, one past it.
   *
   * A row this store does not hold is not an error — a delete that arrives twice, or
   * for a row that only ever existed on the other device, writes nothing.
   */
  async function markDeleted(table: string, idColumn: string, id: string): Promise<void> {
    const found = await client.select(table, idColumn, id, "*");
    const row = found[0];
    if (!row) return;
    await markRowDeleted({ client, clock, table, row });
  }

  /**
   * The lines a row holds, marked along with it.
   *
   * This is Dexie's `on delete cascade` written as marks. On the server that cascade
   * belongs to a real `delete`, and this adapter never issues one — so without this, a
   * deleted entry's lines would travel as live rows pointing at a marked entry, and
   * the local store, which had deleted them, would take them back on the next pull.
   */
  async function markLinesOfEntry(entryId: string): Promise<void> {
    const lines = await client.select(TABLE.intentions, "entry_id", entryId, "*");
    for (const line of lines) await markDeleted(TABLE.intentions, "id", line.id as string);
  }

  // The reads, as locals rather than as the port's methods, because two of them are
  // also needed by `loadCompileLibrary` — and `field_defs` is the sharper case: the
  // port has no `listFieldDefs` at all, so the library read is the only door to that
  // table and a local is the honest way through it.
  const typesOf = async (workspaceId: string) =>
    (await rowsOf(TABLE.meditationTypes, workspaceId)).map(meditationTypeFromRow);
  const meditationsOf = async (workspaceId: string) =>
    (await rowsOf(TABLE.meditations, workspaceId)).map(meditationFromRow);
  const symbolsOf = async (workspaceId: string) =>
    (await rowsOf(TABLE.symbols, workspaceId)).map(symbolFromRow);
  const entriesOf = async (workspaceId: string) =>
    (await rowsOf(TABLE.entries, workspaceId)).map(entryFromRow);
  const intentionsOf = async (workspaceId: string) =>
    (await rowsOf(TABLE.intentions, workspaceId)).map(intentionFromRow);
  const fieldDefsOf = async (workspaceId: string) =>
    (await rowsOf(TABLE.fieldDefs, workspaceId)).map(fieldDefFromRow);
  const fieldOptionsOf = async (workspaceId: string) =>
    (await rowsOf(TABLE.fieldOptions, workspaceId)).map(fieldOptionFromRow);
  const mediaAssetsOf = async (workspaceId: string) => {
    // "In the store's own order", which the port asks for by name: the cloud has no
    // insertion order to fall back on, so `sort_order` is what carries it.
    const rows = await rowsOf(TABLE.mediaAssets, workspaceId);
    return rows.map(mediaAssetFromRow).sort((left, right) => left.sortOrder - right.sortOrder);
  };

  async function listFieldValuesForEntityIds(entityIds: string[]): Promise<FieldValue[]> {
    // `field_values` is scoped by the entity it hangs off rather than by a
    // workspace, which is the one read the equality-shaped `select` cannot express —
    // it is what `selectIn` was added for.
    const rows = liveRows(await client.selectIn(TABLE.fieldValues, "entity_id", entityIds, "*"));
    return rows.map(fieldValueFromRow);
  }

  return {
    /**
     * The whole workspace, read from the cloud.
     *
     * Deliberately **unscoped**: the Dexie store has a plan-scoped branch that reads
     * only what a plan runs, and that branch belongs to the read path, which stays
     * Dexie (`docs/ARCHITECTURE.md`). Re-creating it here would be a second
     * implementation of the same optimization for a path nothing reads through.
     */
    async loadCompileLibrary(workspaceId) {
      const [
        meditationTypes,
        meditations,
        symbols,
        entries,
        intentions,
        fieldDefs,
        fieldOptions,
        mediaAssets,
      ] = await Promise.all([
        typesOf(workspaceId),
        meditationsOf(workspaceId),
        symbolsOf(workspaceId),
        entriesOf(workspaceId),
        intentionsOf(workspaceId),
        fieldDefsOf(workspaceId),
        fieldOptionsOf(workspaceId),
        mediaAssetsOf(workspaceId),
      ]);
      // A value hangs off any entity, and the Entries table has custom columns of its
      // own — leaving the entry ids out made those columns write-only once
      // (`packages/db/src/ports.ts`), and the same read is what a pull needs.
      const entityIds = [
        ...symbols.map((row) => row.id),
        ...meditations.map((row) => row.id),
        ...entries.map((row) => row.id),
      ];
      const fieldValues = await listFieldValuesForEntityIds(entityIds);
      const presets = (await rowsOf(TABLE.presets, workspaceId)).map(presetFromRow);
      return {
        meditationTypes,
        meditations,
        symbols,
        entries,
        intentions,
        fieldDefs,
        fieldOptions,
        fieldValues,
        presets,
        mediaAssets,
      };
    },

    async listMeditationTypes(workspaceId): Promise<MeditationType[]> {
      return typesOf(workspaceId);
    },
    async saveMeditationType(row) {
      await client.upsert(TABLE.meditationTypes, meditationTypeRow(row));
    },
    async deleteMeditationType(typeId) {
      await markDeleted(TABLE.meditationTypes, "id", typeId);
    },

    async listMeditations(workspaceId): Promise<Meditation[]> {
      return meditationsOf(workspaceId);
    },
    async saveMeditation(meditation) {
      await client.upsert(TABLE.meditations, meditationRow(meditation));
    },
    async deleteMeditation(meditationId) {
      await markDeleted(TABLE.meditations, "id", meditationId);
    },

    async listSymbols(workspaceId): Promise<Symbol[]> {
      return symbolsOf(workspaceId);
    },
    async saveSymbol(symbol) {
      await client.upsert(TABLE.symbols, symbolRow(symbol));
    },
    async deleteSymbol(symbolId) {
      await markDeleted(TABLE.symbols, "id", symbolId);
    },

    async listEntries(workspaceId): Promise<Entry[]> {
      return entriesOf(workspaceId);
    },
    async saveEntry(entry) {
      await client.upsert(TABLE.entries, entryRow(entry));
    },
    async deleteEntry(entryId) {
      // The lines first, so a failure between the two leaves a marked entry with live
      // lines rather than lines whose row is already gone.
      await markLinesOfEntry(entryId);
      await markDeleted(TABLE.entries, "id", entryId);
    },

    async listIntentions(workspaceId): Promise<Intention[]> {
      return intentionsOf(workspaceId);
    },
    async saveIntention(intention) {
      await client.upsert(TABLE.intentions, intentionRow(intention));
    },
    async deleteIntention(intentionId) {
      await markDeleted(TABLE.intentions, "id", intentionId);
    },
    async deleteIntentionsForEntry(entryId) {
      await markLinesOfEntry(entryId);
    },

    listFieldValuesForEntityIds,

    async saveFieldDef(def) {
      await client.upsert(TABLE.fieldDefs, fieldDefRow(def));
    },
    async deleteFieldDef(fieldDefId) {
      await markDeleted(TABLE.fieldDefs, "id", fieldDefId);
    },

    async listFieldOptions(workspaceId): Promise<FieldOption[]> {
      return fieldOptionsOf(workspaceId);
    },
    async saveFieldOption(option) {
      await client.upsert(TABLE.fieldOptions, fieldOptionRow(option));
    },
    async deleteFieldOption(optionId) {
      await markDeleted(TABLE.fieldOptions, "id", optionId);
    },

    async saveFieldValue(value) {
      await client.upsert(TABLE.fieldValues, fieldValueRow(value));
    },
    async deleteFieldValue(entityId, fieldDefId) {
      // A value is keyed by the pair, and the seam's reads take **one** column, so the
      // entity's own values are read and the one that matches is picked here. That is
      // a handful of rows per entity rather than a scan, and it is the only way to
      // express a two-column predicate without widening the seam a third time.
      const values = await client.select(TABLE.fieldValues, "entity_id", entityId, "*");
      const match = values.find((row) => row.field_def_id === fieldDefId);
      if (!match) return;
      await markRowDeleted({ client, clock, table: TABLE.fieldValues, row: match });
    },

    async listMediaAssets(workspaceId): Promise<MediaAsset[]> {
      return mediaAssetsOf(workspaceId);
    },
    async saveMediaAsset(asset) {
      await client.upsert(TABLE.mediaAssets, mediaAssetRow(asset));
    },
    async deleteMediaAsset(assetId) {
      await markDeleted(TABLE.mediaAssets, "id", assetId);
    },
  };
}
