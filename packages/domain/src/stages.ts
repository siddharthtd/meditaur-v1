import type { PlanBlock, PlanBlockStage, StageKind } from "./models.ts";

/**
 * Stages: the vocabulary, the seeded templates, and the one rule that says which
 * stages a block runs.
 *
 * The owner's round 15 replaced one timer per block with **one timer per stage**.
 * A stage is a subsection of a meditation block — its intentions, its symbols, its
 * focus, its affirmations — and it carries its own length, its own binaural flag
 * and its own auto-scroll flag.
 *
 * Three things wear the same shape (`PlanBlockStage`), and the difference between
 * them is what this file is about:
 *
 * - a **type's** `stages` is the template: what a *new* block of that type is built
 *   from;
 * - a **meditation's** `stages` is a copy of it, or `null` for "use my type's", so
 *   one chakra can want more intentions than its siblings (§12.8);
 * - a **block's** `stages` is the template *materialised*: the block never reads its
 *   type at run time, so editing a type cannot reshape a plan that already exists.
 *
 * That is why a block's stage keeps its own `label` as well as its `key` and `kind`
 * — the plan's own list of what a materialised stage holds left `label` out, and a
 * block whose stage had no label could only borrow one from the type it must not
 * read. The plan's §13 records it.
 */

/** The closed list a stage's `kind` is drawn from, in the order the seeds use it. */
export const STAGE_KINDS: StageKind[] = [
  "intentions",
  "symbols",
  "focus",
  "affirmations",
];

/**
 * What each kind is called when nothing better is known.
 *
 * A stage's own `label` comes first everywhere the reader looks — this is what a
 * *new* stage of that kind is named, and what the Database's `Kind` cell offers.
 */
export const STAGE_KIND_LABELS: Record<StageKind, string> = {
  intentions: "Intentions",
  symbols: "Symbols",
  focus: "Focus",
  affirmations: "Affirmations",
};

/**
 * Auto-scroll is for the two kinds that are *read* — a column of intentions or
 * affirmations finishing as the stage's clock reaches zero (§12.20). The symbols
 * stage shows pictures and the focus stage shows the visualisation; neither
 * scrolls, so neither carries the switch.
 */
export function autoScrollForKind(kind: StageKind): boolean {
  return kind === "intentions" || kind === "affirmations";
}

/**
 * Binaural is off for intentions and affirmations (§12.12) and on for the rest.
 *
 * That single sentence is the reason a stage carries the flag instead of the block:
 * a chakra's session starts silent, brings the tones in for the symbols, keeps them
 * through the focus and never restarts them in between.
 */
export function binauralForKind(kind: StageKind): boolean {
  return kind === "symbols" || kind === "focus";
}

/** One stage of a template, with the three flags defaulted from its kind. */
export function stage(
  key: string,
  kind: StageKind,
  durationMs: number,
  label: string = STAGE_KIND_LABELS[kind],
): PlanBlockStage {
  return {
    key,
    label,
    kind,
    durationMs,
    binaural: binauralForKind(kind),
    autoScroll: autoScrollForKind(kind),
  };
}

const MINUTE = 60_000;

/**
 * The three stages a chakra and a point run, and their lengths.
 *
 * The owner's §12.8: intentions 2:00, symbols 1:00, focus 6:00 — nine minutes, and
 * a seed value the owner will tune.
 */
export const INTENTION_STAGES: PlanBlockStage[] = [
  stage("intentions", "intentions", 2 * MINUTE),
  stage("symbols", "symbols", 1 * MINUTE),
  stage("focus", "focus", 6 * MINUTE),
];

/**
 * Protection's three stages: an affirmation, the symbols, then the rest of 11:11.
 *
 * The owner's §12.9: 3:00 + 1:30 + 6:41 is 671 s, which is the length the seeded
 * Protection row already carried. The third stage is deliberately "the rest" rather
 * than a round number, and nothing in code keeps the total at 11:11 — a reader who
 * moves one timer is expected to move the total.
 */
export const PROTECTION_STAGES: PlanBlockStage[] = [
  stage("affirmation", "affirmations", 3 * MINUTE, "Affirmation"),
  stage("symbols", "symbols", 90_000),
  stage("affirmations", "affirmations", 401_000),
];

/**
 * Thanks Giving: one stage, and it is silent (§12.10).
 *
 * A **minute** since the owner's round 20 — *"Update thanks giving meditation's
 * affirmation stage timing to 1 minute"* — which is what the block's own duration and
 * the Dexie repair that carries it to a device already holding the catalogue both read
 * (`thanksGivingMinute`).
 */
export const AFFIRMATION_STAGES: PlanBlockStage[] = [
  stage("affirmations", "affirmations", 1 * MINUTE),
];

/** A copy, so a template can never be edited through the row that materialised it. */
export function copyStages(stages: PlanBlockStage[]): PlanBlockStage[] {
  return stages.map((row) => ({ ...row }));
}

/**
 * The length a **new** stage of each kind starts at.
 *
 * A stage's own `durationMs` is always what the session runs — this is only what a
 * stage the reader has just added begins with, and it is the seeded templates' own
 * lengths (a chakra's intentions 2:00, symbols 1:00, focus 6:00; a Thanks Giving's
 * affirmations 3:00) rather than a second opinion about them. The owner's round 19
 * gave a meditation's editor an `Add stage`, and a stage that arrived at `0:00` would
 * be one that does nothing until it is turned.
 */
export const STAGE_KIND_DEFAULT_MS: Record<StageKind, number> = {
  intentions: 2 * MINUTE,
  symbols: 1 * MINUTE,
  focus: 6 * MINUTE,
  affirmations: 3 * MINUTE,
};

/** A new stage of a kind: its kind's own length, and the flags its kind implies. */
export function defaultStage(key: string, kind: StageKind): PlanBlockStage {
  return stage(key, kind, STAGE_KIND_DEFAULT_MS[kind]);
}

/** One stage by its key, or `null`. Keys are stable inside their owner. */
export function stageByKey(
  stages: PlanBlockStage[],
  key: string,
): PlanBlockStage | null {
  return stages.find((row) => row.key === key) ?? null;
}

/**
 * Each stage's auto-scroll agreeing with its kind.
 *
 * The owner's round 17: *"Some chakra sessions have auto-scroll and some don't
 * (some which don't have enough intentions still have auto-scroll), we need this to
 * be consistent."* Both halves of that were true and neither was a bug in the
 * screen: the flag is **stored per stage**, so a plan written by an older build —
 * one where a stage's `autoScroll` defaulted to `false`, or where a reader had
 * turned it off once — keeps that value forever, while a plan made today starts with
 * the kind's own answer. Two plans therefore behaved differently on the same stage
 * of the same chakra, and which one a reader saw depended only on when they had made
 * it.
 *
 * So the flag is *derived* wherever it is repaired: a kind that is read (an
 * intentions or an affirmations stage) scrolls, and a kind that shows pictures or a
 * visualisation does not. This is the one place that sentence is applied to stages
 * already on disk — `packages/db/src/schema.ts` runs it once in a Dexie version,
 * and the reader's own press still overrides it afterwards, because the repair runs
 * once and the switch is theirs from then on.
 */
export function withAutoScroll(stages: PlanBlockStage[]): PlanBlockStage[] {
  return stages.map((row) =>
    row.autoScroll === autoScrollForKind(row.kind)
      ? row
      : { ...row, autoScroll: autoScrollForKind(row.kind) },
  );
}

/** A block's length: its stages added up, computed in one place. */
export function stagesDurationMs(stages: PlanBlockStage[]): number {
  return stages.reduce((total, row) => total + Math.max(0, row.durationMs), 0);
}

/**
 * Which stages a block runs.
 *
 * The block's own stages if it has any, otherwise the meditation's own copy,
 * otherwise its type's template. A block that names no meditation — a cool-off
 * block, until round 15 (2026-09-19) removes them — keeps whatever single stage it was read
 * with, so nothing it stored is lost on the way through.
 */
export function blockStages(
  block: Pick<PlanBlock, "stages">,
  meditation: { stages?: PlanBlockStage[] | null } | null | undefined,
  type: { stages?: PlanBlockStage[] | null } | null | undefined,
): PlanBlockStage[] {
  if (block.stages.length > 0) return block.stages;
  if (meditation?.stages && meditation.stages.length > 0) {
    return copyStages(meditation.stages);
  }
  if (type?.stages && type.stages.length > 0) return copyStages(type.stages);
  return [];
}

/**
 * The stages a **new** block of this meditation runs: its own copy, else its type's.
 *
 * A type nothing knows — an id from a file written before the type rows, or a type
 * that has not been pushed yet — falls back to a chakra's three stages. Answering
 * with something rather than nothing keeps such a block running instead of empty.
 */
export function stagesForMeditation(
  meditation: { stages?: PlanBlockStage[] | null; typeId: string },
  types: readonly { id: string; stages?: PlanBlockStage[] | null }[],
): PlanBlockStage[] {
  if (meditation.stages && meditation.stages.length > 0) {
    return copyStages(meditation.stages);
  }
  const type = types.find((row) => row.id === meditation.typeId);
  if (type?.stages && type.stages.length > 0) return copyStages(type.stages);
  return copyStages(INTENTION_STAGES);
}
