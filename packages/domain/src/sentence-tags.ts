import type { SentenceTag } from "./models.ts";

/**
 * The tags a sentence can carry, with the word a reader sees.
 *
 * The owner's round 26: *"Protection, ThanksGiving and Decleration can have their own tags"* —
 * and *"All will be called Intentions itself from now on. The tab can still be called affirmation
 * in the database."* Only `declaration` is read **by** its tag, because a declaration stage reads
 * the workspace's pool of them and substitutes the block's meditations in; the other two label
 * sentences which their own meditation's stage already reads.
 *
 * This list is the one place the three are spelled, because two of them are also a reader's
 * choice now: the Database's Affirmations table has a `Tag` column over exactly these values
 * (`P4 · 60`), and a list in the component and a union in `models.ts` would drift the first time
 * one moved. The **order** is the order that column offers them, which is the order they are
 * reasoned about: the pool the app ships a sentence for, then the two labels.
 */
export const SENTENCE_TAGS: { value: SentenceTag; label: string }[] = [
  { value: "declaration", label: "Declaration" },
  { value: "thanks_giving", label: "Thanks Giving" },
  { value: "protection", label: "Protection" },
];

/** The word a reader sees for a tag, or `""` for none — a sentence with no tag has no word. */
export function sentenceTagLabel(tag: SentenceTag | null | undefined): string {
  return SENTENCE_TAGS.find((row) => row.value === tag)?.label ?? "";
}
