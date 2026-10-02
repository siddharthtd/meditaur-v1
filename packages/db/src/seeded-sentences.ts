import { THANKS_GIVING_TYPE_ID, type Intention, type Meditation } from "@meditaur/domain";
import { nid } from "./seeded-ids.ts";

/**
 * The two sentences the app itself writes, and the one repair that carries them to a device
 * that already holds a catalogue (the owner's round 26).
 *
 * Both live here for the reason `seeded-points.ts` and `seeded-bindings.ts` live in files of
 * their own: a fresh seed and a Dexie version that carries a seeded change to a device which
 * already has a catalogue must agree **id for id**, because sync merges by id — two devices
 * disagreeing about what a row is, is not a cosmetic difference.
 */

/**
 * The protection sentence the seed plants, on the Protection meditation's two symbol pairs.
 *
 * It is the same words on both, which is why the tag below is matched on the **text** as well
 * as on the row: a reader who rewrote one of the two keeps their own wording, and their row
 * keeps whatever tag it had.
 */
export const SEEDED_PROTECTION_TEXT =
  "I am wholly and completely protected physically, emotionally, mentally and spiritually from lower and negative energies, from manipulation and negative influence, from thoughts, words, deeds, consequences and actions that create pain and suffering.";

/**
 * The declaration the app ships.
 *
 * The owner dictated it in the same breath as the ask: *"during decleration, I just say 'i
 * declare this as the front and back of my <>' where <> is that chakra where I am meditating, or
 * the point I am meditating on."* So it is seeded **with** the placeholder rather than left
 * empty — a Declaration stage with nothing to read is a stage that does nothing, and these are
 * the owner's words rather than the app's.
 */
export const SEEDED_DECLARATION_TEXT = "I declare this as the front and back of my <>";

/**
 * The slot the declaration is minted from.
 *
 * **Fixed**, unlike every other seeded intention, and that is not a style choice: an intention's
 * id is otherwise allocated by the walk that plants it (`nextIntentionId` in
 * `default-workspace.ts`), and a repair cannot reproduce a running counter. The rule the
 * round-21 repairs established is that the seed and the repair mint the same id for the same
 * row, so this one row names its own slot. `0x2f0` sits above the walk's range (which begins at
 * `0x100`) and below the entries' (`0x300`); the seed's own test pins that no other intention
 * takes it.
 */
export const SEEDED_DECLARATION_SLOT = 0x2f0;

/** The declaration row, minted the same way by the seed and by the repair below. */
export function seededDeclaration(workspaceId: string): Intention {
  return {
    id: nid(SEEDED_DECLARATION_SLOT),
    workspaceId,
    // An **orphan**: a declaration is written about whatever the session is running rather than
    // about a pair, which is exactly what an intention with no entry is (`Intention`). That is
    // also what puts it in the Affirmations table, where the owner can edit the words.
    entryId: null,
    sortOrder: 0,
    text: SEEDED_DECLARATION_TEXT,
    tag: "declaration",
    archivedAt: null,
    revision: 0,
    updatedAt: 0,
  };
}

/**
 * The rows to write back, or `[]` for a device that is already right.
 *
 * Two halves, both gated the way this tree's repairs are — on the row still looking like the one
 * the app wrote:
 *
 * - **the Protection sentence gains its tag**, when its words are still the app's own;
 * - **the declaration is planted**, but only on a store that holds the app's own catalogue (its
 *   Thanks Giving row is the marker for it) and has no declaration yet. A store with a handful of
 *   hand-made sentences is not waiting for one, which is the same rule the points circuit uses
 *   before it plants itself.
 */
export function withSeededSentences(input: {
  meditations: readonly Meditation[];
  intentions: readonly Intention[];
}): Intention[] {
  const changed: Intention[] = [];
  for (const row of input.intentions) {
    if (row.tag != null) continue;
    if (row.text !== SEEDED_PROTECTION_TEXT) continue;
    changed.push({ ...row, tag: "protection" });
  }
  const holds = input.meditations.some((row) => row.typeId === THANKS_GIVING_TYPE_ID);
  const has = input.intentions.some((row) => row.tag === "declaration");
  const workspaceId = input.meditations[0]?.workspaceId;
  if (holds && !has && workspaceId) changed.push(seededDeclaration(workspaceId));
  return changed;
}
