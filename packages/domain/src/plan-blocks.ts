import { fail } from "./app-error.ts";
import type { PlanBlock, PlanBlockStage, PlanDisplay, StageKind, SymbolScope } from "./models.ts";
import { normalizePlanDisplay } from "./plan-display.ts";
import { autoScrollForKind, STAGE_KIND_LABELS } from "./stages.ts";

export const PLAN_BLOCK_ERRORS = {
  invalid: "Plan blocks are not valid",
} as const;

/**
 * The alarm a new plan starts with, and the one the seeded plan carries: **off**.
 *
 * The owner's round 17, on the plan screen's `Alarm` switch: *"the thanks giving
 * session has alarm on, noone asked for an alarm-on on this screen, it always was
 * an alarm - off here."* Every layer used to answer `true` for "the value a new
 * thing starts with" — the preference, the seeded plan, and a plan built from the
 * preference — so the alarm rang for a reader who had never asked for it, and
 * turning it on was a press nobody had made on their behalf.
 *
 * It is a **default**, not a rule: the switch on the plan screen is still the
 * reader's, the run screen still writes it back, and `Plan.alarmEnabled: true` on a
 * plan that carries it is obeyed. What changed is only what the app hands a reader
 * who has said nothing.
 */
export const DEFAULT_ALARM_ENABLED = false;

function invalid(): never {
  fail("plan.blocksInvalid", PLAN_BLOCK_ERRORS.invalid);
}

function requireObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function requireString(value: unknown): string {
  if (typeof value !== "string" || !value) invalid();
  return value;
}

function requireNullableString(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value;
  invalid();
}

/**
 * A block's own yes/no, or `null` for "the plan decides".
 *
 * Absent and `null` are the **same** answer here, unlike everywhere else in this
 * file: this is the one field whose default is not its own absence but its owner's
 * value, so a plan written before the field existed must read as "ask the plan",
 * not as `false` — which would silently silence every block in it.
 */
function requireNullableBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  invalid();
}

/** A block's own Display, or `null` for the plan's. */
function requireBlockDisplay(value: unknown): PlanDisplay | null {
  if (value === null || value === undefined) return null;
  return normalizePlanDisplay(value);
}

function requireNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) invalid();
  return value;
}

function requireSymbolScope(value: unknown): SymbolScope {
  if (value === undefined || value === null) return "rotate";
  if (value === "rotate" || value === "all") return value;
  invalid();
}

function requireStageKind(value: unknown): StageKind {
  if (
    value === "intentions" ||
    value === "symbols" ||
    value === "focus" ||
    value === "affirmations"
  ) {
    return value;
  }
  invalid();
}

function requireStage(value: unknown): PlanBlockStage {
  const item = requireObject(value);
  const kind = requireStageKind(item.kind);
  return {
    key: requireString(item.key),
    label: typeof item.label === "string" && item.label ? item.label : STAGE_KIND_LABELS[kind],
    kind,
    durationMs: requireNumber(item.durationMs),
    // A stage written before the flag existed is read as its kind's own answer,
    // which is the rule the flag was seeded from — never as `false`, which would
    // silently silence a stored session.
    binaural: item.binaural === undefined ? kind === "symbols" || kind === "focus" : Boolean(item.binaural),
    autoScroll:
      item.autoScroll === undefined ? autoScrollForKind(kind) : Boolean(item.autoScroll),
  };
}

function requireStages(value: unknown, legacy: Record<string, unknown>): PlanBlockStage[] {
  if (Array.isArray(value)) return value.map(requireStage);
  // A block stored before stages carried **one** length. It is read as one stage of
  // that length rather than re-materialised from a template the file cannot name:
  // a plan the reader built keeps its timing, and only the blocks added after this
  // round are built from their type.
  return [
    {
      key: "focus",
      label: STAGE_KIND_LABELS.focus,
      kind: "focus",
      durationMs: requireNumber(legacy.durationMs),
      binaural: true,
      autoScroll: false,
    },
  ];
}

/**
 * The meditation a block names, under either word for it.
 *
 * `focusPointId` is what a block stored before the rename says, and a plan is a
 * row of the reader's own making — a stored plan that stopped opening because a
 * field was renamed is not a trade anyone agreed to. Both keys are read here
 * rather than migrated in place, for the same reason the display's old `chakra`
 * area is mapped in `normalizePlanDisplay`.
 */
function requireMeditationId(item: Record<string, unknown>): string | null {
  // `??` would turn a block that names no meditation (`null`) into the missing old
  // key, and then into a failure — so the *presence* of the new key is what decides,
  // not its value.
  const value = item.meditationId !== undefined ? item.meditationId : item.focusPointId;
  return requireNullableString(value);
}

/**
 * The plan's blocks, with any cool-off block the file still holds **dropped**.
 *
 * The owner's round 15 deleted the kind: a block is a meditation block, and one that
 * names no meditation has nothing to run. A stored plan therefore loses its cool-off
 * blocks rather than gaining an empty one, and a plan that was nothing *but* cool-off
 * reads as a plan with no blocks — which `compilePlan` says out loud rather than
 * running a session of silence.
 */
export function parsePlanBlocks(value: unknown): PlanBlock[] {
  if (!Array.isArray(value)) invalid();
  return value
    .filter((row) => requireObject(row).type !== "cooloff")
    .map((row) => {
      const item = requireObject(row);
      return {
        id: requireString(item.id),
        sortOrder: requireNumber(item.sortOrder),
        stages: requireStages(item.stages, item),
        meditationId: requireMeditationId(item),
        symbolId: requireNullableString(item.symbolId),
        symbolScope: requireSymbolScope(item.symbolScope),
        binauralPresetId: requireNullableString(item.binauralPresetId),
        ambientAssetId: requireNullableString(item.ambientAssetId),
        alarmAssetId: requireNullableString(item.alarmAssetId),
        // The two the owner's round 17 added, both defaulting to the plan's: a
        // stored block that has never been asked is the plan's, not its own answer.
        alarmEnabled: requireNullableBoolean(item.alarmEnabled),
        display: requireBlockDisplay(item.display),
      };
    });
}
