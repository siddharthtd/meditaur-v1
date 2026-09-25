import { POINT_TYPE_ID, type Entry, type Meditation } from "@meditaur/domain";
import { describe, expect, it } from "vitest";
import { buildDefaultWorkspace } from "../../../packages/db/src/default-workspace.ts";
import {
  BOUND_MEDITATION_SLOTS,
  BOUND_SYMBOL_SLOTS,
  seededBindingId,
  withReikiBindings,
} from "../../../packages/db/src/seeded-bindings.ts";
import { nid } from "../../../packages/db/src/seeded-ids.ts";

/**
 * The repair that binds the four reiki symbols to every chakra and point (Dexie v31).
 *
 * The owner's words are in `seeded-bindings.ts`; what matters here is the two halves this
 * test pins: the repair plants **the seed's own rows** (same ids, so a repaired device and a
 * fresh one agree), and it never touches a pair the reader already formed.
 */

/** The catalogue a device seeded before round 21 holds: nothing bound but the seed's pairs. */
function asTheOldSeed() {
  const ws = buildDefaultWorkspace("ws-test");
  const bound = new Set(
    ws.entries.flatMap((row) =>
      row.symbolId ? [seededBindingIdFor(row.meditationId, row.symbolId)] : [],
    ),
  );
  return { ws, entries: ws.entries.filter((row) => !bound.has(row.id)) };
}

/** The binding id for a stored pair, or `null` when it is not one of the four. */
function seededBindingIdFor(meditationId: string | null, symbolId: string): string | null {
  const slot = BOUND_MEDITATION_SLOTS.find((candidate) => nid(candidate) === meditationId);
  const glyph = BOUND_SYMBOL_SLOTS.find((candidate) => nid(candidate) === symbolId);
  if (slot === undefined || glyph === undefined) return null;
  return seededBindingId(slot, glyph);
}

describe("the four reiki symbols, bound", () => {
  it("plants one row per chakra and point, and plants the seed's own", () => {
    const old = asTheOldSeed();
    const patch = withReikiBindings({
      meditations: old.ws.meditations,
      symbols: old.ws.symbols,
      entries: old.entries,
    });

    expect(patch.entries.length).toBe(
      BOUND_MEDITATION_SLOTS.length * BOUND_SYMBOL_SLOTS.length,
    );
    for (const row of patch.entries) {
      expect(row.id, "the id a fresh seed would give the same pair").toBe(
        seededBindingIdFor(row.meditationId, row.symbolId!),
      );
      expect(row.archivedAt).toBeNull();
      // A binding is the association and nothing else: it carries no sentences of its own.
      expect(old.ws.intentions.some((line) => line.entryId === row.id)).toBe(false);
    }
    // The pairs the seed plants, exactly: a chakra or point, times the four, no duplicates.
    expect(new Set(patch.entries.map((row) => `${row.meditationId}|${row.symbolId}`)).size).toBe(
      patch.entries.length,
    );

    // The seed's own answer for the same pairs — id for id, so the two devices agree.
    const fresh = buildDefaultWorkspace("ws-test");
    const seeded = fresh.entries.filter(
      (row) => row.symbolId !== null && seededBindingIdFor(row.meditationId, row.symbolId) !== null,
    );
    expect(seeded.map((row) => row.id).sort()).toEqual(patch.entries.map((row) => row.id).sort());
  });

  it("leaves a pair the reader bound themselves exactly as it is", () => {
    const old = asTheOldSeed();
    const heart = old.ws.meditations.find((row) => row.name === "Heart Chakra")!;
    const theirs: Entry = {
      id: "01900000-0000-7000-8000-0000000000d0",
      workspaceId: "ws-test",
      meditationId: heart.id,
      symbolId: nid(BOUND_SYMBOL_SLOTS[2]!),
      sortOrder: 99,
      archivedAt: null,
      revision: 1,
      updatedAt: 1,
    };
    const patch = withReikiBindings({
      meditations: old.ws.meditations,
      symbols: old.ws.symbols,
      entries: [...old.entries, theirs],
    });
    const forHeart = patch.entries.filter((row) => row.meditationId === heart.id);
    expect(forHeart.map((row) => row.symbolId)).toEqual([nid(BOUND_SYMBOL_SLOTS[0]!) , nid(BOUND_SYMBOL_SLOTS[1]!), nid(BOUND_SYMBOL_SLOTS[3]!)]);
    expect(patch.entries.map((row) => row.id)).not.toContain(
      seededBindingIdFor(heart.id, theirs.symbolId!),
    );
  });

  it("binds nothing the seed does not know", () => {
    const old = asTheOldSeed();
    const mine: Meditation = {
      ...old.ws.meditations.find((row) => row.name === "Liver")!,
      id: "01900000-0000-7000-8000-0000000000c9",
      name: "My Own Place",
      typeId: POINT_TYPE_ID,
    };
    const patch = withReikiBindings({
      meditations: [...old.ws.meditations, mine],
      symbols: old.ws.symbols,
      entries: old.entries,
    });
    expect(patch.entries.some((row) => row.meditationId === mine.id)).toBe(false);
  });

  it("binds a symbol that is not in the store at all to nothing", () => {
    const old = asTheOldSeed();
    const patch = withReikiBindings({
      meditations: old.ws.meditations,
      symbols: old.ws.symbols.filter((row) => row.id !== nid(BOUND_SYMBOL_SLOTS[3]!)),
      entries: old.entries,
    });
    expect(patch.entries.some((row) => row.symbolId === nid(BOUND_SYMBOL_SLOTS[3]!))).toBe(false);
    expect(patch.entries.length).toBe(
      BOUND_MEDITATION_SLOTS.length * (BOUND_SYMBOL_SLOTS.length - 1),
    );
  });

  it("changes nothing on a device that is already right", () => {
    const ws = buildDefaultWorkspace("ws-test");
    expect(
      withReikiBindings({
        meditations: ws.meditations,
        symbols: ws.symbols,
        entries: ws.entries,
      }),
    ).toEqual({ entries: [] });
  });

  it("touches nothing at all in a store with no catalogue", () => {
    expect(withReikiBindings({ meditations: [], symbols: [], entries: [] })).toEqual({
      entries: [],
    });
  });
});
