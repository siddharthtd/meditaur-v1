import {
  CHAKRA_TYPE_ID,
  POINT_TYPE_ID,
  type Entry,
  type Meditation,
  type Symbol,
} from "@meditaur/domain";
import { nid } from "./seeded-ids.ts";
import { SEEDED_POINTS, seededPointSlotFor } from "./seeded-points.ts";

/**
 * The four reiki symbols, bound to every chakra meditation and every point (round 21).
 *
 * The owner's words: *"Add hon-sha-ze-sho-nen, sei-hei-ki and cho-ku-rei to all chakra
 * meditations and point if the reiki feature flag (which defaults to true) is true. Add
 * day-kyo-mo if reiki-master is true, karuna symbols that exist today should be gated under
 * the karuna reiki feature flag."*
 *
 * The second half of that is **already true and stays that way**: a symbol carries its own
 * `reikiSystem`, and `visibleSymbols` / `isSymbolSystemEnabled` hide the ones whose flag is
 * off. So the flag is a *visibility* gate and never a write gate — nothing here asks who is
 * looking, and binding a symbol the reader has hidden costs them nothing, because the
 * compile path drops it before a session can name it. That is also why this file does not
 * take flags: a device seeds once, and an account's flags can change under it.
 *
 * An entry is the association itself (`Entry` is the row that *is* the chakra × symbol pair),
 * so a binding is one entry with no sentences of its own. The shape is the one the seeded
 * Crown × Kriya pair already had, and the symbols' own order is `SEEDED_REIKI_SYMBOLS`'.
 */

/** The four symbols, by the slot their seeded rows occupy. */
export const BOUND_SYMBOL_SLOTS: readonly number[] = [0x38, 0x39, 0x3a, 0x3b];

/** Where a binding's own id begins; one slot per (meditation, symbol) pair. */
const BINDING_SLOT_BASE = 0x400;

/**
 * Every meditation a binding is planted on: the seven chakras, the two organs the seed
 * already had, and the thirteen body points (round 21's twelve, and the thirteenth round 22
 * split out of `Thyroid and thymus`).
 *
 * The *index* in this list is half of a binding's id, which is why the points are taken in
 * `SEEDED_POINTS`' own order and that array is append-only: `Thymus` is last here as it is
 * there, so adding it moved no binding id the seed had already handed out. Where a binding
 * *reads* is its `sortOrder`, and the callers that plant one walk `sortOrder`, not this list.
 */
export const BOUND_MEDITATION_SLOTS: readonly number[] = [
  0x20,
  0x21,
  0x22,
  0x23,
  0x24,
  0x25,
  0x26,
  0x27,
  0x28,
  ...SEEDED_POINTS.map((point) => point.slot),
];

/** The id of one binding. Two callers ask this, which is the whole point of deriving it. */
export function seededBindingId(meditationSlot: number, symbolSlot: number): string {
  const at = BOUND_MEDITATION_SLOTS.indexOf(meditationSlot);
  const glyph = BOUND_SYMBOL_SLOTS.indexOf(symbolSlot);
  if (at < 0 || glyph < 0) {
    throw new Error(`no binding slot for ${meditationSlot.toString(16)}/${symbolSlot.toString(16)}`);
  }
  return nid(BINDING_SLOT_BASE + at * BOUND_SYMBOL_SLOTS.length + glyph);
}

/** The slot a seeded meditation occupies, or `null` for a row this seed does not know. */
export function seededMeditationSlotFor(row: { id: string; name: string }): number | null {
  const byId = BOUND_MEDITATION_SLOTS.find((slot) => nid(slot) === row.id);
  if (byId !== undefined) return byId;
  // A row a reader renamed, or one this seed never minted, is still the point by its name —
  // which is how the sentences in `seeded-points.ts` find a reader's own `Thighs`.
  return seededPointSlotFor(row.name);
}

/** Whether a meditation is one the four symbols are bound to: a chakra or a point. */
function isBindable(typeId: string): boolean {
  return typeId === CHAKRA_TYPE_ID || typeId === POINT_TYPE_ID;
}

/**
 * One meditation's four bindings, from `firstSortOrder` on.
 *
 * Per meditation rather than all at once so the seed can walk the same order it walked its
 * pairs in and keep every meditation's rows together: a chakra's own symbols first, then the
 * four reiki ones.
 */
export function seededBindingsFor(input: {
  workspaceId: string;
  meditationId: string;
  meditationSlot: number;
  firstSortOrder: number;
}): Entry[] {
  return BOUND_SYMBOL_SLOTS.map((symbolSlot, at) => ({
    id: seededBindingId(input.meditationSlot, symbolSlot),
    workspaceId: input.workspaceId,
    meditationId: input.meditationId,
    symbolId: nid(symbolSlot),
    sortOrder: input.firstSortOrder + at,
    archivedAt: null,
    revision: 0,
    updatedAt: 0,
  }));
}

/**
 * The bindings, carried to a device that already has a catalogue (Dexie v31).
 *
 * Two gates, both of them v24's rule — a repair is for what the app got wrong, never for what
 * the reader chose:
 *
 * - a **meditation** is bound when it is a chakra or a point *and* the seed knows it, by id or
 *   by name. A meditation the reader added themselves is none of this repair's business;
 * - a **pair** that already has an entry is left alone. That matters most for the four
 *   symbols' own rows: a reader who bound `Cho Ku Rei` to their Heart Chakra by hand keeps
 *   their row, with whatever they wrote on it.
 *
 * Nothing is removed, and a device with no catalogue is untouched.
 */
export function withReikiBindings(input: {
  meditations: readonly Meditation[];
  symbols: readonly Symbol[];
  entries: readonly Entry[];
}): { entries: Entry[] } {
  const workspaceId = input.meditations[0]?.workspaceId ?? null;
  if (!workspaceId) return { entries: [] };

  const present = new Set(input.symbols.map((row) => row.id));
  const bySlot = new Map<number, string>();
  for (const row of input.meditations) {
    if (!isBindable(row.typeId)) continue;
    const slot = seededMeditationSlotFor(row);
    if (slot !== null && !bySlot.has(slot)) bySlot.set(slot, row.id);
  }

  const pairs = new Set(
    input.entries.map((row) => `${row.meditationId}|${row.symbolId ?? ""}`),
  );
  const takenIds = new Set(input.entries.map((row) => row.id));
  let order = input.entries.reduce((high, row) => Math.max(high, row.sortOrder), -1) + 1;

  const added: Entry[] = [];
  for (const slot of BOUND_MEDITATION_SLOTS) {
    const meditationId = bySlot.get(slot);
    if (!meditationId) continue;
    for (const symbolSlot of BOUND_SYMBOL_SLOTS) {
      const symbolId = nid(symbolSlot);
      if (!present.has(symbolId)) continue;
      if (pairs.has(`${meditationId}|${symbolId}`)) continue;
      const id = seededBindingId(slot, symbolSlot);
      if (takenIds.has(id)) continue;
      added.push({
        id,
        workspaceId,
        meditationId,
        symbolId,
        sortOrder: order++,
        archivedAt: null,
        revision: 0,
        updatedAt: 0,
      });
    }
  }
  return { entries: added };
}
