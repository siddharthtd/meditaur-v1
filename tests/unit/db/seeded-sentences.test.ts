import { describe, expect, it } from "vitest";
import { THANKS_GIVING_TYPE_ID } from "@meditaur/domain";
import { buildDefaultWorkspace } from "../../../packages/db/src/default-workspace.ts";
import { nid } from "../../../packages/db/src/seeded-ids.ts";
import {
  SEEDED_DECLARATION_SLOT,
  SEEDED_DECLARATION_TEXT,
  SEEDED_PROTECTION_TEXT,
  seededDeclaration,
  withSeededSentences,
} from "../../../packages/db/src/seeded-sentences.ts";
import { makeIntention, makeMeditation } from "../../fixtures/library.ts";

/**
 * The two sentences the app itself writes (the owner's round 26): the one declaration a
 * Declaration stage reads, and the tag on the Protection sentence.
 *
 * The rule these cases exist for is the round-21 repairs' rule — a fresh seed and the repair
 * that carries a seeded change to a device which already has a catalogue must agree **id for
 * id**, because sync merges by id. That is why the declaration names a fixed slot rather than
 * taking the walk's next number, and why the first case below is about the whole seed's ids.
 */
describe("the sentences the app writes", () => {
  const seeded = buildDefaultWorkspace("ws-test");
  const declaration = seeded.intentions.find((row) => row.tag === "declaration");
  const protection = seeded.intentions.filter((row) => row.text === SEEDED_PROTECTION_TEXT);

  it("seeds one declaration, and no seeded intention takes its slot", () => {
    const ids = seeded.intentions.map((row) => row.id);
    expect(new Set(ids).size, "every seeded intention has an id of its own").toBe(ids.length);
    expect(declaration?.id).toBe(nid(SEEDED_DECLARATION_SLOT));
    expect(declaration?.text).toBe(SEEDED_DECLARATION_TEXT);
    // An **orphan**: written about whatever the session is running rather than about a pair,
    // which is also what puts it in the Affirmations table for the owner to edit.
    expect(declaration?.entryId).toBeNull();
    expect(declaration?.sortOrder).toBe(0);
  });

  it("labels the Protection sentence, and nothing else", () => {
    // Two pairs carry it — Zonar and Rama — and both are labelled; the tag is the reader's word
    // for the pool rather than a second way of finding it, so the stage reads by meditation
    // either way.
    expect(protection).toHaveLength(2);
    expect(protection.every((row) => row.tag === "protection")).toBe(true);
    expect(seeded.intentions.filter((row) => row.tag != null)).toHaveLength(3);
  });

  it("plants the same row the seed mints, on a store that holds the catalogue and none yet", () => {
    const planted = withSeededSentences({
      meditations: seeded.meditations,
      intentions: seeded.intentions.filter((row) => row.tag !== "declaration"),
    });
    expect(planted).toEqual([declaration]);
    // And the factory the repair calls is the one the seed calls, so the two cannot drift.
    expect(seededDeclaration("ws-test")).toEqual(declaration);
  });

  it("changes nothing on a device that already has one, or one with no Thanks Giving", () => {
    expect(
      withSeededSentences({ meditations: seeded.meditations, intentions: seeded.intentions }),
    ).toEqual([]);
    // A store of the reader's own rows is not waiting for the app's catalogue: the Thanks Giving
    // row is the marker that this is the app's own seed.
    expect(
      withSeededSentences({
        meditations: seeded.meditations.filter((row) => row.typeId !== THANKS_GIVING_TYPE_ID),
        intentions: [],
      }),
    ).toEqual([]);
    // Nothing to plant in, either: a store with no meditations has no workspace to own a row.
    expect(withSeededSentences({ meditations: [], intentions: [] })).toEqual([]);
  });

  it("tags the Protection sentence by its words, and leaves a reader's own alone", () => {
    const mine = makeIntention("i1", "I am protected");
    const theirs = makeIntention("i2", SEEDED_PROTECTION_TEXT);
    const already = makeIntention("i3", SEEDED_PROTECTION_TEXT, { tag: "thanks_giving" });
    const planted = withSeededSentences({
      meditations: [makeMeditation("fp1", "Root")],
      intentions: [mine, theirs, already],
    });
    // Only the row whose words are still the app's own, and only when it has no tag at all:
    // a tag the reader (or a later build) put there is not the app's to overwrite.
    expect(planted).toEqual([{ ...theirs, tag: "protection" }]);
  });
});
