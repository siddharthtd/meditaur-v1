import { DEFAULT_REIKI_SYSTEM, SEEDED_REIKI_SYMBOLS, type Symbol } from "@meditaur/domain";
import { SYMBOL_ORDER, normaliseName, placesFor } from "./catalog-order.ts";

/**
 * The reiki repair a device that already holds a catalogue needs (the owner's round
 * 16, §2.5 and §6).
 *
 * Two things have to happen on a device that exists, and neither can happen in the
 * seed, because the seed only ever runs once: every symbol gains the system it
 * belongs to, and the four rows the owner added join the catalogue **in the places
 * the order lists give them** — after `Zonar`, before `Rama`, which is in no list.
 * A version that has already run is never re-run, so this is a new Dexie version's
 * rule (v24) rather than an edit to v16's.
 *
 * The rule is a pure function so that it can be tested without IndexedDB, which the
 * unit suite has none of, and so that the upgrade body stays one line —
 * `tests/unit/db/reiki-symbols.test.ts` proves the rule and the wiring both.
 *
 * It returns the rows to **put**, and nothing for a device that is already correct,
 * so the caller is safe to run on every version and costs one read the second time:
 *
 * - a row that names no system is stamped with `DEFAULT_REIKI_SYSTEM`, which is not
 *   a guess about a row the app made: until this round the app shipped one system,
 *   so this is what the row already was. A row that *does* name one keeps it — an
 *   imported file may say `usui_reiki`, and an upgrade is not the place to overrule
 *   a value the reader's own data carries;
 * - a row whose place is not the one the order gives it is returned with the new
 *   one, because the four rows push everything after them along;
 * - the four seeded rows are added **only** when the store holds neither their id
 *   nor their name. The id is the seeded identity; the name is what catches a
 *   reader who typed `Cho Ku Rei` in before the row existed, and there the reader's
 *   row wins — their description and usage are not ours to replace;
 * - a new row needs a workspace and takes the one the catalogue already names.
 *   Writing a row without one is the defect v19 exists to remember: every read
 *   scopes by `workspaceId`, so a row missing it exists and is invisible.
 *
 * No rows at all means no catalogue to repair: a device that has never seeded itself
 * gets the four rows from the seed, which is where they belong.
 */
export function symbolsWithReikiSystems(existing: readonly Symbol[]): Symbol[] {
  const workspaceId = existing.find((row) => row.workspaceId)?.workspaceId;
  if (!workspaceId) return [];

  const names = new Set(existing.map((row) => normaliseName(row.name)));
  const ids = new Set(existing.map((row) => row.id));
  const added: Symbol[] = [];
  for (const seeded of SEEDED_REIKI_SYMBOLS) {
    if (ids.has(seeded.id) || names.has(normaliseName(seeded.name))) continue;
    added.push({
      id: seeded.id,
      workspaceId,
      name: seeded.name,
      // Empty by the owner's answer: the four rows are theirs to fill in.
      description: "",
      usage: "",
      imageAssetId: null,
      reikiSystem: seeded.reikiSystem,
      sortOrder: 0,
      archivedAt: null,
      revision: 0,
      updatedAt: 0,
    });
  }

  // The places are computed over the rows the device will *hold*, added ones
  // included, so the four names take the slots the order gives them instead of
  // pushing onto the end.
  const places = placesFor(SYMBOL_ORDER, [...existing, ...added]);
  const rows: Symbol[] = [];
  for (const row of existing) {
    const place = places.get(row.id) ?? row.sortOrder;
    const reikiSystem = row.reikiSystem ?? DEFAULT_REIKI_SYSTEM;
    if (row.reikiSystem === reikiSystem && row.sortOrder === place) continue;
    rows.push({ ...row, reikiSystem, sortOrder: place });
  }
  for (const row of added) {
    rows.push({ ...row, sortOrder: places.get(row.id) ?? row.sortOrder });
  }
  return rows;
}
