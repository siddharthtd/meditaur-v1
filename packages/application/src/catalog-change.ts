import type {
  BinauralPreset,
  Entry,
  FieldDef,
  FieldOption,
  FieldValue,
  Intention,
  Meditation,
  MeditationType,
  Plan,
  Symbol,
} from "@meditaur/domain";

/**
 * What a delete changed, beyond the row it was asked about.
 *
 * A create or an update answers with the stamped row it stored, and that row is
 * enough to patch one list. A **delete cannot answer that way**: every delete in
 * this app cascades. `deletePreset` clears `meditations.defaultBinauralPresetId`
 * and every plan block that named the preset before the row goes, and
 * `deleteMediaAsset` clears the meditations, the symbols and the plan blocks that
 * pointed at the file. Dropping the deleted id from one list would therefore leave
 * the meditations and the symbols stale in the very view that shows them.
 *
 * So this is the answer a cascade gives instead, and it covers **plans** for the
 * same reason: `patchPlanBlocks` writes a plan whose blocks named the deleted row,
 * and a screen holding that plan would otherwise be holding a reference the store
 * no longer has. Plans are outside the Library's own view; a change-set that hid
 * them would be a half-truth about what the delete did.
 *
 * `removed` carries ids, because the rows are gone and an id is all a list needs
 * to drop one. `updated` carries the stored rows themselves, so a screen replaces
 * by id and never has to guess what the cascade wrote. A row the cascade did not
 * touch is deliberately absent — "the store still holds this, unchanged" is not a
 * change to apply.
 *
 * A **value** is not named. `field_values` is keyed by `(entityId, fieldDefId)`
 * rather than by an id of its own, and every value a cascade removes belongs to
 * an entity the same cascade removed: the row goes, and its values go with it.
 * Naming them would hand a screen a pair it has no list to drop.
 *
 * `updated` carries the rows **only the Database writes** as well — a type, the
 * entries, the lines inside them, a column, its options and the values in the
 * cells — because that grid holds tables the Library does not, and item 4's point
 * is that a save patches what moved instead of re-reading nine tables (`P2 · 4`).
 * A bucket with no writer would be the dead structure the id scheme warns about, so
 * each one here arrived with the write that fills it.
 *
 * `updated.presets` is the one bucket a *record* write needs rather than a grid
 * write: **archiving** a preset moves its row without removing it, and the Archive
 * page holds presets from this view. A preset's *delete* needs only the id in
 * `removed`, which is why the bucket stayed absent until archiving had an answer to
 * give (`setRecordArchived`).
 */
export type CatalogChangeSet = {
  /** Ids the store no longer holds. */
  removed: {
    presets: string[];
    mediaAssets: string[];
    /**
     * The symbol the delete was asked about, and the rows that went with it.
     *
     * An entry that named the symbol is a connection to something gone, so it
     * goes too — and the lines inside those entries go with it, because a line
     * belongs to its row (`deleteEntry` is what enforces that locally, and
     * `on delete cascade` says it on the server). A screen holding the Lines
     * table — the Affirmations tab does — would otherwise keep drawing
     * sentences whose row no longer exists.
     */
    symbols: string[];
    entries: string[];
    intentions: string[];
    /**
     * A meditation the delete took, and — for a type — every meditation that
     * named it, because a meditation whose type is gone could not be shown,
     * filtered or picked anywhere. The type row itself is named here too.
     *
     * These are removals and not rewrites: unlike a preset's delete, which clears
     * a reference and keeps the row, a removed meditation is gone from the plans
     * as well, so there is nothing left to replace by id.
     */
    meditations: string[];
    meditationTypes: string[];
  };
  /** The rows the write also saved on the way, with the values they now hold. */
  updated: {
    meditations: Meditation[];
    symbols: Symbol[];
    plans: Plan[];
    presets: BinauralPreset[];
    meditationTypes: MeditationType[];
    entries: Entry[];
    intentions: Intention[];
    fieldDefs: FieldDef[];
    fieldOptions: FieldOption[];
    fieldValues: FieldValue[];
  };
};

/**
 * The change-set's Database-only buckets, empty.
 *
 * A cascade that rewrites none of them — a preset's delete, an asset's — still has to
 * say so, and this says it once instead of six times at each of those writers. It is a
 * function rather than a shared constant because two change-sets must never end up
 * holding the same array: one screen patching a bucket in place would edit another
 * write's answer. The rows themselves are filled by the one write that owns them,
 * `commitDatabaseDraft` (`P2 · 4`).
 */
export function noDatabaseRows(): Pick<
  CatalogChangeSet["updated"],
  "meditationTypes" | "entries" | "intentions" | "fieldDefs" | "fieldOptions" | "fieldValues"
> {
  return {
    meditationTypes: [],
    entries: [],
    intentions: [],
    fieldDefs: [],
    fieldOptions: [],
    fieldValues: [],
  };
}

/**
 * The change-set's removals, empty — for the writes that remove nothing.
 *
 * The Database's Save is the caller that needs it: it writes rows, lines, columns,
 * options and values and takes nothing away, because a delete in this app is its own
 * operation with its own answer (`deleteMeditation` and its siblings). A function for
 * the same reason the one above is: fresh arrays, so no two answers share one.
 */
export function noRemovals(): CatalogChangeSet["removed"] {
  return {
    presets: [],
    mediaAssets: [],
    symbols: [],
    entries: [],
    intentions: [],
    meditations: [],
    meditationTypes: [],
  };
}

/**
 * The change-set's `updated` side, empty.
 *
 * The whole of it, unlike `noDatabaseRows`, because the write that needs this one is
 * a write that named a row in *any* of the buckets: an archive. A cascade knows which
 * of the nine it touched from its own code; a record's step-aside does not know until
 * it has looked the row up, and spelling the other eight out at each of the six
 * answers would be six chances to leave one wrong.
 */
export function noUpdatedRows(): CatalogChangeSet["updated"] {
  return {
    meditations: [],
    symbols: [],
    plans: [],
    presets: [],
    ...noDatabaseRows(),
  };
}

/**
 * The answer a write that rewrote **one** row and took nothing away gives.
 *
 * That is the whole of archiving: nothing that depends on the record is copied,
 * moved or edited, so the record's own row *is* what changed and a screen replaces it
 * by id. `removed` is empty for the same reason — an archive is the reader's one
 * undo, and a row that can come back was never removed.
 */
export function oneRowChangeSet(
  updated: Partial<CatalogChangeSet["updated"]>,
): CatalogChangeSet {
  return { removed: noRemovals(), updated: { ...noUpdatedRows(), ...updated } };
}
