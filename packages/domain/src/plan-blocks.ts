import { fail } from "./app-error.ts";
import type {
  IntentionRandomiser,
  PlanBlock,
  PlanBlockStage,
  PlanDisplay,
  StageKind,
  SymbolScope,
} from "./models.ts";
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

/**
 * A block's own randomiser, or `null` for "this block reads every line".
 *
 * **Tolerant on purpose, and tolerant in the direction that cannot surprise a reader.**
 * The value arrives from a `jsonb` column, written by a build that may have known a shape
 * this one does not, so damage reads as `null` — never asked — rather than as a half-on
 * setting that would thin a list the reader never asked to thin. That is the reading
 * `normalizePlanDisplay` gives a damaged Display, and it is why this is exported:
 * `plan-rows.ts` reads the same column on the cloud side, and one rule read twice is how
 * the two stores stay in step.
 *
 * A count is floored and never negative; a half whose count is not a number reads as `0` —
 * none of that half — because the other fallback, keeping all of it, would quietly undo
 * the setting the reader did make.
 */
export function normalizeIntentionRandomiser(value: unknown): IntentionRandomiser | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  return {
    on: item.on === true,
    own: randomiserHalf(item.own),
    symbols: randomiserHalf(item.symbols),
  };
}

/** One half of the setting: a switch, and the count it keeps. */
function randomiserHalf(value: unknown): { on: boolean; count: number } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { on: false, count: 0 };
  }
  const item = value as Record<string, unknown>;
  const count =
    typeof item.count === "number" && Number.isFinite(item.count) && item.count > 0
      ? Math.floor(item.count)
      : 0;
  return { on: item.on === true, count };
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
 * The meditations a block names, under any of the three shapes a stored block may have.
 *
 * `meditationIds` is what the app writes now: the owner's round 22 made a block's
 * meditations a **list**, so a point block can club several points into one pass.
 * `meditationId` is what every block written before that says, and `focusPointId` what one
 * written before the round-15 rename says — a plan is a row of the reader's own making, and
 * a stored plan that stopped opening because a field changed shape is not a trade anyone
 * agreed to. All three are read here rather than migrated in place, for the same reason the
 * display's old `chakra` area is mapped in `normalizePlanDisplay`.
 */
function requireMeditationIds(item: Record<string, unknown>): string[] {
  if (Array.isArray(item.meditationIds)) {
    // A blank entry is not a meditation: it is a row the reader has not chosen yet, and
    // `compilePlan` refuses a block that names nothing rather than running silence.
    return item.meditationIds.filter(
      (row): row is string => typeof row === "string" && row !== "",
    );
  }
  // `??` would turn a block that names no meditation (`null`) into the missing old
  // key, and then into a failure — so the *presence* of the new key is what decides,
  // not its value.
  const single = item.meditationId !== undefined ? item.meditationId : item.focusPointId;
  const value = requireNullableString(single);
  return value ? [value] : [];
}

/**
 * The meditation a block leads with, or `null` for a block that names none.
 *
 * A block's stages, its binaural answer, its Display facts and the picture a Focus stage
 * draws all come from its **first** point: one set of timers is what "the block's stages"
 * means, and the first point is the one the reader put there. Everything else — the
 * intentions, the symbols the points have in common — reads across the whole list
 * (`compilePlan`).
 */
export function leadMeditationId(block: PlanBlock): string | null {
  return block.meditationIds[0] ?? null;
}

/**
 * A block with some of its meditations taken out, or `null` when it has none left.
 *
 * A delete cascades into the plans — the owner's rule is that removing a meditation from
 * the library removes it from the plans — so the blocks that ran it step out of the plan.
 * A block that ran **only** that one has nothing left to run, which is the state
 * `compilePlan` refuses, so it leaves as well; a point block that loses one point of three
 * keeps its place and its other two. A block that named none of them is returned **by
 * identity**, so a caller patching a list can tell that nothing moved.
 */
export function withoutMeditations(
  block: PlanBlock,
  gone: ReadonlySet<string>,
): PlanBlock | null {
  const meditationIds = block.meditationIds.filter((id) => !gone.has(id));
  if (meditationIds.length === block.meditationIds.length) return block;
  if (meditationIds.length === 0) return null;
  return { ...block, meditationIds };
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
        meditationIds: requireMeditationIds(item),
        symbolId: requireNullableString(item.symbolId),
        symbolScope: requireSymbolScope(item.symbolScope),
        binauralPresetId: requireNullableString(item.binauralPresetId),
        ambientAssetId: requireNullableString(item.ambientAssetId),
        alarmAssetId: requireNullableString(item.alarmAssetId),
        // The two the owner's round 17 added, both defaulting to the plan's: a
        // stored block that has never been asked is the plan's, not its own answer.
        alarmEnabled: requireNullableBoolean(item.alarmEnabled),
        display: requireBlockDisplay(item.display),
        // The owner's round 24, and the same reading as `alarmEnabled`: a block that has
        // never been asked reads every line rather than a made-up count.
        intentionRandomiser: normalizeIntentionRandomiser(item.intentionRandomiser),
      };
    });
}
