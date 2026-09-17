import type { FocusSymbolBinding, Intention, Plan, PlanBlock } from "@meditaur/domain";

/**
 * What a catalogue delete takes with it.
 *
 * Deleting is a cascade in this product, not a refusal: removing a focus point
 * or a symbol also removes the lines that were written about it and the blocks
 * of any plan that used it. That is what the reader asked for, but it is also
 * silent data loss unless it is said out loud first — so the library asks for
 * this *before* the second press and shows the answer next to the armed button.
 *
 * `removed` is countable loss (things that stop existing); `cleared` is a
 * reference that goes blank (a block keeps its place but loses its sound). The
 * two are described differently on purpose: one is a warning, the other is housekeeping.
 */
export type DeletionImpact = {
  blocks: number;
  plans: number;
  intentions: number;
  attachments: number;
  fieldValues: number;
  cleared: number;
};

export const NO_DELETION_IMPACT: DeletionImpact = {
  blocks: 0,
  plans: 0,
  intentions: 0,
  attachments: 0,
  fieldValues: 0,
  cleared: 0,
};

/** Plans whose block list would change, as a count. */
function plansChanged(plans: Plan[], match: (block: PlanBlock) => boolean): number {
  return plans.filter((plan) => plan.blocks.some(match)).length;
}

export function focusPointDeletionImpact(
  focusId: string,
  bindings: Pick<FocusSymbolBinding, "focusPointId">[],
  intentions: Pick<Intention, "focusPointId">[],
  plans: Plan[],
  fieldValues: { entityId: string }[],
): DeletionImpact {
  const blocks = plans.flatMap((plan) => plan.blocks).filter((b) => b.focusPointId === focusId);
  return {
    ...NO_DELETION_IMPACT,
    blocks: blocks.length,
    plans: plansChanged(plans, (b) => b.focusPointId === focusId),
    intentions: intentions.filter((row) => row.focusPointId === focusId).length,
    attachments: bindings.filter((row) => row.focusPointId === focusId).length,
    fieldValues: fieldValues.filter((row) => row.entityId === focusId).length,
  };
}

export function symbolDeletionImpact(
  symbolId: string,
  bindings: Pick<FocusSymbolBinding, "symbolId">[],
  intentions: Pick<Intention, "symbolId">[],
  plans: Plan[],
  fieldValues: { entityId: string }[],
): DeletionImpact {
  // A block that named the symbol keeps its place and falls back to walking the
  // focus point's other symbols, so it is cleared, not removed.
  const blocks = plans.flatMap((plan) => plan.blocks).filter((b) => b.symbolId === symbolId);
  return {
    ...NO_DELETION_IMPACT,
    cleared: blocks.length,
    intentions: intentions.filter((row) => row.symbolId === symbolId).length,
    attachments: bindings.filter((row) => row.symbolId === symbolId).length,
    fieldValues: fieldValues.filter((row) => row.entityId === symbolId).length,
  };
}

/** The second line of a delete confirmation: what goes, in plain words. */
export function describeDeletionImpact(impact: DeletionImpact): string {
  const sentences: string[] = [];
  const removed: string[] = [];
  if (impact.blocks > 0) {
    removed.push(`${count(impact.blocks, "block")} from ${count(impact.plans, "plan")}`);
  }
  if (impact.intentions > 0) removed.push(count(impact.intentions, "intention"));
  if (impact.attachments > 0) removed.push(count(impact.attachments, "symbol attachment"));
  if (impact.fieldValues > 0) removed.push(count(impact.fieldValues, "field value"));
  if (removed.length > 0) sentences.push(`This also removes ${joinList(removed)}.`);
  if (impact.cleared > 0) {
    sentences.push(
      `${count(impact.cleared, "place")} that pointed at it ${
        impact.cleared === 1 ? "is" : "are"
      } cleared.`,
    );
  }
  return sentences.join(" ");
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]!}`;
}
