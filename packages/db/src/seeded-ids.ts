import {
  copyStages,
  INTENTION_STAGES,
  SEEDED_MEDITATION_TYPES,
  type PlanBlockStage,
} from "@meditaur/domain";

/**
 * The seeded catalogue's identity, in one place.
 *
 * `nid` was written inline in `default-workspace.ts` until the owner's round 21 gave it a
 * second caller: the Dexie version that carries a seeded change to a device which already
 * has a catalogue. A fresh seed and a repair must mint the **same** id for the same row, or
 * two devices disagree about what a row is — the merge is keyed by id, so that is not a
 * cosmetic difference. The function and the stage helper beside it therefore live here and
 * both callers import them.
 */

/** `01900000-0000-7000-8000-<slot>` — the one shape every seeded id has. */
export function nid(slot: number): string {
  return `01900000-0000-7000-8000-${slot.toString(16).padStart(12, "0")}`;
}

/**
 * A seeded type's stages, copied, so a meditation can be given its own copy of the
 * template it was seeded from (§12.8).
 *
 * A type nothing knows falls back to a chakra's three stages rather than to none.
 */
export function stagesForType(typeId: string): PlanBlockStage[] {
  const row = SEEDED_MEDITATION_TYPES.find((type) => type.id === typeId);
  return copyStages(row?.stages ?? INTENTION_STAGES);
}
