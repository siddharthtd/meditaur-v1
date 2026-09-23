import type { Meditation, Plan, Symbol } from "@meditaur/domain";

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
  };
};
