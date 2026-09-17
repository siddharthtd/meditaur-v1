import {
  BUILTIN_COLUMN_KEYS,
  fail,
  type FieldDef,
  type FocusSymbolBinding,
  type Intention,
  type TableView,
} from "@meditaur/domain";

export const CATALOG_ERRORS = {
  nameRequired: "Name is required",
  textRequired: "Text is required",
  columnsRequired: "Pick at least one column",
  keyRequired: "Key is required",
  keyReserved: "That key is a built-in column",
  keyTaken: "A field already uses that key",
  keyInTableView: "This field is used in a table view",
  focusMissing: "That focus point is gone.",
  intentionNeedsBinding: "Attach this symbol to the focus point first",
  keepOnePreset: "Keep at least one preset",
  keepOneTableView: "Keep at least one table view",
} as const;

/**
 * The two refusals a delete still has (2026-09-16). Everything else cascades:
 * the owner's rule is that removing something from the library removes it from
 * everything that used it, rather than sending the reader off to unpick twelve
 * references by hand. The only deletes that stay refused are the ones that would
 * leave the app with nothing to work with at all — no preset, or no table view.
 */
export function catalogFail(key: keyof typeof CATALOG_ERRORS): never {
  fail(`catalog.${key}`, CATALOG_ERRORS[key]);
}

export function requireName(value: string): string {
  const name = value.trim();
  if (!name) catalogFail("nameRequired");
  return name;
}

export function requireText(value: string): string {
  const text = value.trim();
  if (!text) catalogFail("textRequired");
  return text;
}

export function requireColumnKeys(keys: string[]): string[] {
  const columnKeys = keys.filter((key) => key.length > 0);
  if (columnKeys.length === 0) catalogFail("columnsRequired");
  return columnKeys;
}

const BUILTIN_KEYS = new Set<string>(BUILTIN_COLUMN_KEYS);

/**
 * The identifier a custom field is stored under, from the heading its reader
 * typed.
 *
 * The owner's round 6 asked for the field form to be "heading and description"
 * rather than "label and key" — a reader naming a column should not also have to
 * invent a slug for it. So the key is derived once, from the heading, and then
 * kept: `key` is what a table view lists in its `columnKeys`, and renaming a
 * field must not take a column out from under a view that still lists it.
 *
 * A heading that collides with a built-in column (`Name`, `Image`, …) or with
 * another field in the same pool gets a numbered suffix rather than a refusal,
 * because the reader has no way to see the collision coming.
 */
export function fieldKeyFor(
  def: Pick<FieldDef, "id" | "label" | "entityType">,
  existing: Pick<FieldDef, "id" | "key" | "entityType">[],
): string {
  const base = slugForFieldKey(def.label);
  const taken = new Set(
    existing
      .filter((row) => row.id !== def.id && row.entityType === def.entityType)
      .map((row) => row.key),
  );
  let key = base;
  for (let n = 2; BUILTIN_KEYS.has(key) || taken.has(key); n += 1) {
    key = `${base}-${n}`;
  }
  return key;
}

/** `Vedic mantra` → `vedic-mantra`. Never empty: an unnamed field is `field`. */
function slugForFieldKey(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "field";
}

export function requireFieldKey(value: string): string {
  const key = value.trim();
  if (!key) catalogFail("keyRequired");
  if (BUILTIN_KEYS.has(key)) catalogFail("keyReserved");
  return key;
}

export function assertFieldDefSavable(
  def: Pick<FieldDef, "id" | "key" | "entityType">,
  existing: Pick<FieldDef, "id" | "key" | "entityType">[],
  views: Pick<TableView, "columnKeys">[],
): string {
  const key = requireFieldKey(def.key);
  const previous = existing.find((row) => row.id === def.id);
  if (
    previous &&
    previous.key !== key &&
    views.some((view) => view.columnKeys.includes(previous.key))
  ) {
    // Renaming a key that a table view still lists would leave the view showing
    // a column that no longer exists, so the rename waits for the view.
    catalogFail("keyInTableView");
  }
  if (
    existing.some(
      (row) => row.id !== def.id && row.entityType === def.entityType && row.key === key,
    )
  ) {
    catalogFail("keyTaken");
  }
  return key;
}

export function assertIntentionSavable(
  intention: Pick<Intention, "focusPointId" | "symbolId">,
  bindings: Pick<FocusSymbolBinding, "focusPointId" | "symbolId">[],
): void {
  if (!intention.symbolId || !intention.focusPointId) return;
  if (
    !bindings.some(
      (row) => row.focusPointId === intention.focusPointId && row.symbolId === intention.symbolId,
    )
  ) {
    catalogFail("intentionNeedsBinding");
  }
}
