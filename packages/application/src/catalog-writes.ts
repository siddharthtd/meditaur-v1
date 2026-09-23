import { fail, type FieldDef, type FieldScope } from "@meditaur/domain";

export const CATALOG_ERRORS = {
  nameRequired: "Name is required",
  textRequired: "Text is required",
  keyRequired: "Key is required",
  keyReserved: "That key is a built-in column",
  keyTaken: "A column already uses that key",
  focusMissing: "That meditation is gone.",
  meditationTypeMissing: "That meditation type is gone.",
  symbolMissing: "That symbol is gone.",
  affirmationMissing: "That affirmation is gone.",
  entryMissing: "That row is gone.",
  keepOnePreset: "Keep at least one preset",
  entryNeedsRef: "A row needs a chakra or a symbol",
  entryExists: "That chakra and symbol are already a row",
  fieldHoldsValues: "That column holds values, so it cannot be removed",
  fieldTypeLocked: "A column that holds values keeps its type",
  optionInUse: "That option is used by a row",
} as const;

/**
 * The two refusals a delete still has. Everything else cascades: the owner's rule
 * is that removing something from the library removes it from everything that
 * used it, rather than sending the reader off to unpick twelve references by hand.
 * The one that stays is the delete that would leave the app with nothing to work
 * with — no preset.
 *
 * Column removal is a *different* kind of refusal, and it is not one of these:
 * §4 draws no Remove control at all on a column that holds a value, so the reader
 * is never offered the operation. `saveFieldDef` and `deleteFieldDef` enforce it
 * anyway, because a rule only the UI keeps is not a rule.
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

/**
 * Keys that would collide with a column the table already has.
 *
 * Per scope, because the three tables have different built-ins: a chakra has a
 * Location, a symbol has a Usage, and the Entries table's leading cell is the
 * pair itself. A reader adding a column called "Usage" to the chakras is not
 * colliding with anything, and a reader adding one to the symbols is.
 */
const RESERVED_BY_SCOPE: Record<FieldScope, string[]> = {
  // `type` rather than `kind`: a meditation's type is a row now, and the library
  // shows it as a built-in column of its own.
  meditation: ["name", "location", "type"],
  symbol: ["name", "description", "usage", "image"],
  entry: ["chakra", "symbol", "intentions"],
  // An affirmation's own row *is* its text (§12.10) — its sentence is the draft's
  // `name` and the store's `text` — so neither word can go to a column.
  affirmation: ["name", "text"],
};

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
  def: Pick<FieldDef, "id" | "label" | "scope">,
  existing: Pick<FieldDef, "id" | "key" | "scope">[],
): string {
  const base = slugForFieldKey(def.label);
  const taken = new Set(
    existing.filter((row) => row.id !== def.id && row.scope === def.scope).map((row) => row.key),
  );
  const reserved = new Set(RESERVED_BY_SCOPE[def.scope]);
  let key = base;
  for (let n = 2; reserved.has(key) || taken.has(key); n += 1) {
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
  return key;
}

/**
 * A column's key, checked against the columns of *its own table*.
 *
 * The table-view half of this is gone with the views: a key that names a column
 * nothing reads is no longer a way to strand a reader's work, and the plan's
 * display resolves a key that no longer exists by skipping it. What remains is the
 * collision this table must not have — two columns of one table cannot share a
 * key, because the key is what a stored value hangs off.
 */
export function assertFieldDefSavable(
  def: Pick<FieldDef, "id" | "key" | "scope">,
  existing: Pick<FieldDef, "id" | "key" | "scope">[],
): string {
  const key = requireFieldKey(def.key);
  if (RESERVED_BY_SCOPE[def.scope].includes(key)) catalogFail("keyReserved");
  if (
    existing.some(
      (row) => row.id !== def.id && row.scope === def.scope && row.key === key,
    )
  ) {
    catalogFail("keyTaken");
  }
  return key;
}
