import type { BinauralPreset } from "@meditaur/domain";

export const PRESET_ERRORS = {
  missing: "That preset is gone.",
} as const;

export function clonePreset(
  preset: BinauralPreset,
  input: { id: string; name: string },
): BinauralPreset {
  const copy = structuredClone(preset);
  copy.id = input.id;
  copy.name = input.name;
  // A copy is a new row, so it starts unversioned the way `clonePlan` does —
  // carrying the source's revision would claim a history it does not have.
  copy.revision = 0;
  copy.updatedAt = 0;
  return copy;
}
