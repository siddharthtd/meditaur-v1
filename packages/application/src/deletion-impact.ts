import type { Entry, FieldValue, Meditation, Intention, Plan, PlanBlock } from "@meditaur/domain";

/**
 * What an operation at one of §4's five levels would do.
 *
 * Two things changed with the Database. An impact is no longer always a *delete*:
 * archiving steps an item aside and Restore puts it back, so the same counts are
 * reported under a different verb, and the sentence says which one the reader is
 * about to do. And the unit of loss is the **row** rather than the attachment:
 * a chakra's rows are entries, and each of them holds the lines written about it,
 * so "4 rows and 7 intentions" is what the reader sees go, not "4 symbol
 * attachments".
 *
 * `mode` decides the verb. `kind` decides the shape of the sentence: a record is
 * named, a row is "this row", and a line is not a row at all.
 */
export type DeletionImpact = {
  mode: "archive" | "delete";
  kind:
    | "meditation"
    | "meditationType"
    | "symbol"
    | "preset"
    | "entry"
    | "line"
    | "field"
    | "media";
  /** The record's name, when the level has one to name. */
  name: string | null;
  /**
   * Meditations a type takes with it. Zero for everything else.
   *
   * It is its own count because it is the one thing a reader cannot see from the
   * rows: the meditations of a type have no rows of their own on the Types table.
   */
  meditations: number;
  /** Entry rows the operation steps aside or destroys. */
  rows: number;
  /** Lines inside those rows, plus any line the operation is about. */
  lines: number;
  /** Plan blocks that go with a chakra, or fall back when a symbol does. */
  blocks: number;
  plans: number;
  /** Custom column values typed into the thing, or into its rows. */
  fieldValues: number;
  /** Places that keep their place and lose a reference — a block losing its sound. */
  cleared: number;
};

export const NO_DELETION_IMPACT: DeletionImpact = {
  mode: "delete",
  kind: "entry",
  name: null,
  meditations: 0,
  rows: 0,
  lines: 0,
  blocks: 0,
  plans: 0,
  fieldValues: 0,
  cleared: 0,
};

/** Plans whose block list would change, as a count. */
function plansChanged(plans: Plan[], match: (block: PlanBlock) => boolean): number {
  return plans.filter((plan) => plan.blocks.some(match)).length;
}

/**
 * A record's visible burden: the live rows that name it and the live lines inside
 * them.
 *
 * Live only, in both modes. The sentence is about what the reader can see change —
 * an already-archived row is not news, and counting it would make archiving a
 * chakra sound like it does more than it does. A permanent delete does reach
 * hidden rows as well, which is what its "removes" verb is warning about.
 */
function visibleBurden(
  id: string,
  side: "meditationId" | "symbolId",
  entries: Entry[],
  lines: Intention[],
): { rows: number; lines: number; entryIds: Set<string> } {
  const rows = entries.filter(
    (row) => row.archivedAt == null && row[side] === id,
  );
  const entryIds = new Set(rows.map((row) => row.id));
  return {
    rows: rows.length,
    lines: lines.filter(
      (line) =>
        line.archivedAt == null && line.entryId !== null && entryIds.has(line.entryId),
    ).length,
    entryIds,
  };
}

export function meditationImpact(input: {
  mode: "archive" | "delete";
  name: string | null;
  id: string;
  entries: Entry[];
  lines: Intention[];
  plans: Plan[];
  fieldValues: Pick<FieldValue, "entityId">[];
}): DeletionImpact {
  const burden = visibleBurden(input.id, "meditationId", input.entries, input.lines);
  const blocks = input.plans
    .flatMap((plan) => plan.blocks)
    .filter((block) => block.meditationIds.includes(input.id));
  return {
    ...NO_DELETION_IMPACT,
    mode: input.mode,
    kind: "meditation",
    name: input.name,
    rows: burden.rows,
    lines: burden.lines,
    blocks: blocks.length,
    plans: plansChanged(input.plans, (block) => block.meditationIds.includes(input.id)),
    fieldValues:
      input.fieldValues.filter((row) => row.entityId === input.id).length +
      valuesInEntries(burden.entryIds, input.fieldValues),
  };
}

export function symbolImpact(input: {
  mode: "archive" | "delete";
  name: string | null;
  id: string;
  entries: Entry[];
  lines: Intention[];
  plans: Plan[];
  fieldValues: Pick<FieldValue, "entityId">[];
}): DeletionImpact {
  const burden = visibleBurden(input.id, "symbolId", input.entries, input.lines);
  // A block that named this symbol keeps its place and goes back to walking
  // whatever the chakra still has, so it is *cleared*, not removed — which is also
  // why `blocks` stays 0 here.
  const cleared = input.plans
    .flatMap((plan) => plan.blocks)
    .filter((block) => block.symbolId === input.id).length;
  return {
    ...NO_DELETION_IMPACT,
    mode: input.mode,
    kind: "symbol",
    name: input.name,
    rows: burden.rows,
    lines: burden.lines,
    fieldValues:
      input.fieldValues.filter((row) => row.entityId === input.id).length +
      valuesInEntries(burden.entryIds, input.fieldValues),
    cleared,
  };
}

/** One entry row: itself, the lines inside it, and its own column values. */
export function entryImpact(input: {
  mode: "archive" | "delete";
  id: string;
  lines: Intention[];
  fieldValues: Pick<FieldValue, "entityId">[];
}): DeletionImpact {
  return {
    ...NO_DELETION_IMPACT,
    mode: input.mode,
    kind: "entry",
    lines: input.lines.filter((line) => line.archivedAt == null && line.entryId === input.id)
      .length,
    fieldValues: input.fieldValues.filter((row) => row.entityId === input.id).length,
  };
}

/**
 * A meditation type: the row itself, and every meditation that names it.
 *
 * The owner's round 15 made a type a row, and removing one takes its meditations
 * with it — a meditation whose type is gone could not be shown, filtered or
 * picked anywhere, so there is no such state to leave behind. Archiving is the
 * gentler verb: the type steps aside, its meditations stop being reachable (no
 * live type means no tab and no table), and Restore brings them back untouched.
 *
 * The counts are the sum over the type's meditations, computed from the same
 * `meditationImpact` a single meditation uses, so a type's sentence cannot drift
 * from a meditation's.
 */
export function meditationTypeImpact(input: {
  mode: "archive" | "delete";
  name: string | null;
  id: string;
  meditations: Meditation[];
  entries: Entry[];
  lines: Intention[];
  plans: Plan[];
  fieldValues: Pick<FieldValue, "entityId">[];
}): DeletionImpact {
  const mine = input.meditations.filter((row) => row.typeId === input.id);
  const ids = new Set(mine.map((row) => row.id));
  const each = mine.map((row) =>
    meditationImpact({
      mode: input.mode,
      name: row.name,
      id: row.id,
      entries: input.entries,
      lines: input.lines,
      plans: input.plans,
      fieldValues: input.fieldValues,
    }),
  );
  const sum = (pick: (impact: DeletionImpact) => number) =>
    each.reduce((total, impact) => total + pick(impact), 0);
  return {
    ...NO_DELETION_IMPACT,
    mode: input.mode,
    kind: "meditationType",
    name: input.name,
    meditations: mine.length,
    rows: sum((impact) => impact.rows),
    lines: sum((impact) => impact.lines),
    blocks: sum((impact) => impact.blocks),
    // Plans, not blocks-that-change: two meditations of one type in one plan are
    // one plan the reader loses a place in.
    plans: input.plans.filter((plan) =>
      plan.blocks.some((block) => block.meditationIds.some((id) => ids.has(id))),
    ).length,
    fieldValues: sum((impact) => impact.fieldValues),
  };
}

/** A preset is referenced by blocks and by nothing else. */
export function presetImpact(input: {
  mode: "archive" | "delete";
  name: string | null;
  id: string;
  plans: Plan[];
}): DeletionImpact {
  return {
    ...NO_DELETION_IMPACT,
    mode: input.mode,
    kind: "preset",
    name: input.name,
    cleared: input.plans
      .flatMap((plan) => plan.blocks)
      .filter((block) => block.binauralPresetId === input.id).length,
  };
}

/** A column: the values typed into it, by row or by record. */
export function fieldImpact(input: {
  mode: "archive" | "delete";
  name: string | null;
  values: Pick<FieldValue, "fieldDefId">[];
}): DeletionImpact {
  return {
    ...NO_DELETION_IMPACT,
    mode: input.mode,
    kind: "field",
    name: input.name,
    fieldValues: input.values.length,
  };
}

export function lineImpact(
  mode: "archive" | "delete",
  fieldValues = 0,
): DeletionImpact {
  return { ...NO_DELETION_IMPACT, mode, kind: "line", lines: 1, fieldValues };
}

/*
 * `affirmationImpact` was here. The owner's round 16, §2.1 merged the affirmations
 * into the lines, so a sentence — orphan or written about a row — is described by
 * `lineImpact`, and the sentence it produces ("Archives this line.") is the honest
 * one, because that is what the row is. A line in the Affirmations table may have
 * columns of its own, and `fieldValues` is how `describeDeletionImpact` says so.
 */

function valuesInEntries(
  entryIds: Set<string>,
  fieldValues: Pick<FieldValue, "entityId">[],
): number {
  return fieldValues.filter((row) => entryIds.has(row.entityId)).length;
}

/**
 * The sentence the reader sees under the armed control, or beside a single-tap
 * archive.
 *
 * §4's shape: name the thing, name what goes with it, and — for an archive — say
 * that nothing is deleted and Restore brings it back. The record level names the
 * record, the row level says "this row", and neither invents detail it does not
 * have: a count of zero is simply left out.
 */
export function describeDeletionImpact(impact: DeletionImpact): string {
  const verb = impact.mode === "archive" ? "Archives" : "Removes";
  if (impact.kind === "line") {
    // A sentence in the Affirmations table can have columns of its own, and the
    // count is what tells the reader the column's value goes too. Zero is simply
    // left out, the way every other count here is.
    const tail =
      impact.fieldValues > 0 ? ` with ${count(impact.fieldValues, "field value")}` : "";
    return impact.mode === "archive"
      ? `Archives this line${tail}.`
      : `Removes this line${tail}.`;
  }
  if (impact.kind === "media") {
    return impact.cleared > 0
      ? `${count(impact.cleared, "place")} that pointed at it ${
          impact.cleared === 1 ? "is" : "are"
        } cleared.`
      : "";
  }
  if (impact.kind === "entry") {
    return `${verb} this row${withLines(impact.lines)}.`;
  }
  if (impact.kind === "field") {
    const values = impact.fieldValues;
    return values > 0
      ? `Removes the column${impact.name ? ` ${impact.name}` : ""} and ${count(values, "value")} in it.`
      : `Removes the column${impact.name ? ` ${impact.name}` : ""}.`;
  }
  const subject = impact.name ?? "this";
  const pieces: string[] = [];
  // A type's own burden leads its sentence: the meditations are the part the
  // reader cannot count from the table they are looking at.
  if (impact.meditations > 0) pieces.push(count(impact.meditations, "meditation"));
  if (impact.rows > 0) pieces.push(count(impact.rows, "row"));
  if (impact.lines > 0) pieces.push(count(impact.lines, "intention"));
  // A record's own columns go with it too, and saying so is the difference
  // between the reader knowing and finding out later.
  if (impact.fieldValues > 0) pieces.push(count(impact.fieldValues, "field value"));
  let tail = pieces.length > 0 ? ` with ${joinList(pieces)}` : "";
  // §4's own example reads "4 rows, 7 intentions and its place in 2 plans": the
  // rows and lines are one clause, and the plan's part follows it.
  if ((impact.kind === "meditation" || impact.kind === "meditationType") && impact.plans > 0) {
    tail += `${pieces.length > 0 ? "," : " with"} its place in ${count(impact.plans, "plan")}`;
  }
  const cleared =
    impact.cleared > 0
      ? ` ${
          impact.kind === "symbol"
            ? `${count(impact.cleared, "block")} goes back to the next symbol.`
            : `${count(impact.cleared, "place")} that pointed at it ${
                impact.cleared === 1 ? "is" : "are"
              } cleared.`
        }`
      : "";
  if (impact.mode === "archive") {
    return `${verb} ${subject}${tail}; nothing is deleted and Restore puts all of it back.${cleared}`;
  }
  return `${verb} ${subject}${tail}.${cleared}`;
}

function withLines(lines: number): string {
  return lines > 0 ? ` and ${count(lines, "line")}` : "";
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]!}`;
}
