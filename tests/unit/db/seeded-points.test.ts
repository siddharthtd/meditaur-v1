import { POINT_TYPE_ID, type Entry, type Intention, type Meditation } from "@meditaur/domain";
import { describe, expect, it } from "vitest";
import { buildDefaultWorkspace } from "../../../packages/db/src/default-workspace.ts";
import {
  BOUND_SYMBOL_SLOTS,
  withReikiBindings,
} from "../../../packages/db/src/seeded-bindings.ts";
import { nid } from "../../../packages/db/src/seeded-ids.ts";
import {
  SEEDED_POINTS,
  pointsInCatalogueOrder,
  seededPointEntryId,
  seededPointId,
  seededPointLineId,
  seededPointSlotFor,
  splitPancreasAndSpleen,
  splitThyroidAndThymus,
  withSeededPoints,
} from "../../../packages/db/src/seeded-points.ts";

/**
 * The repair that carries the owner's body points to a device that already seeded itself
 * (Dexie v31, v32's split of the one that was two, and v34's split of the pair round 25 pulled
 * apart).
 *
 * The seed runs once, so `buildDefaultWorkspace` is the *fresh* answer and this rule is for
 * the answer a device is already holding. It is a pure function so this suite can test it at
 * all — the unit suite has no IndexedDB — which is the shape v24 established.
 *
 * The fixtures build the **old** shape on purpose: the catalogue as it was before round 21,
 * taken from the seed that is there now so the two cannot drift.
 */

/** The catalogue a device seeded before round 21 holds: no new points, no bindings on them. */
function asTheOldSeed() {
  const ws = buildDefaultWorkspace("ws-test");
  const mine = new Set(SEEDED_POINTS.map((point) => seededPointId(point.slot)));
  const meditations = ws.meditations.filter((row) => !mine.has(row.id));
  const entries = ws.entries.filter(
    (row) => row.meditationId !== null && !mine.has(row.meditationId),
  );
  const lines = new Set(entries.map((row) => row.id));
  return {
    ws,
    meditations,
    entries,
    intentions: ws.intentions.filter((row) => row.entryId === null || lines.has(row.entryId)),
  };
}

describe("the thirteen body points", () => {
  it("plants them, with their sentences, on a device that never saw them", () => {
    const old = asTheOldSeed();
    const patch = withSeededPoints(old);
    // The order the rows are planted in is the order they **read** — `pointsInCatalogueOrder()`
    // — which is not the order they sit in `SEEDED_POINTS`: a slot is half of a binding's id,
    // so that array is append-only and `Thymus` is last in it while reading fourth.
    const catalogue = pointsInCatalogueOrder();

    expect(patch.meditations.map((row) => row.name)).toEqual(
      catalogue.map((point) => point.name),
    );
    for (const row of patch.meditations) expect(row.typeId).toBe(POINT_TYPE_ID);
    // Their place is the seed's own, after every rank the device already held — the two
    // organs are on that device with their order stored, so nothing it has is renumbered.
    const highest = Math.max(...old.meditations.map((row) => row.sortOrder));
    expect(patch.meditations.map((row) => row.sortOrder)).toEqual(
      catalogue.map((_, index) => highest + 1 + index),
    );
    expect(patch.entries.map((row) => row.symbolId)).toEqual(catalogue.map(() => null));
    expect(patch.intentions.length).toBe(
      catalogue.reduce((total, point) => total + point.sentences.length, 0),
    );
    // …and it is **the seed's own answer**: same names, same ids, same sentences. A device
    // repaired by this and a device seeded fresh must be holding the same rows.
    const fresh = buildDefaultWorkspace("ws-test");
    expect(patch.meditations.map((row) => row.id)).toEqual(
      catalogue.map((point) => seededPointId(point.slot)),
    );
    for (const point of catalogue) {
      const entry = patch.entries.find((row) => row.meditationId === seededPointId(point.slot));
      expect(entry?.id, point.name).toBe(seededPointEntryId(point.slot));
      expect(
        patch.intentions
          .filter((row) => row.entryId === entry?.id)
          .map((row) => row.text),
        `${point.name}'s sentences`,
      ).toEqual([...point.sentences]);
      // The same rows the fresh seed plants, by id and by text.
      const seeded = fresh.intentions.filter((row) => row.entryId === entry?.id);
      expect(seeded.map((row) => row.text)).toEqual([...point.sentences]);
      expect(seeded.map((row) => row.id)).toEqual(
        point.sentences.map((_, at) => seededPointLineId(point.slot, at)),
      );
    }
  });

  it("writes them onto a point the reader made themselves rather than beside it", () => {
    // The owner's own case: round 20, they created `Thighs` by hand while writing an
    // affirmation, and that row *is* the point. Planting a second one beside it would be
    // the app arguing with the reader.
    const old = asTheOldSeed();
    const mine: Meditation = {
      ...buildDefaultWorkspace("ws-test").meditations.find(
        (row) => row.name === "Thighs",
      )!,
      id: "01900000-0000-7000-8000-0000000000f0",
      name: "Thighs",
      typeId: POINT_TYPE_ID,
    };
    const patch = withSeededPoints({
      ...old,
      meditations: [...old.meditations, mine],
    });

    expect(patch.meditations.map((row) => row.name)).not.toContain("Thighs");
    const thigh = SEEDED_POINTS.find((point) => point.name === "Thighs")!;
    const entry = patch.entries.find((row) => row.meditationId === mine.id);
    expect(entry?.id, "the seeded id, on the reader's own row").toBe(
      seededPointEntryId(thigh.slot),
    );
    expect(patch.intentions.filter((row) => row.entryId === entry?.id).map((row) => row.text)).toEqual(
      [...thigh.sentences],
    );
  });

  it("leaves a point that already has its own lines exactly as it is", () => {
    const old = asTheOldSeed();
    const thigh = SEEDED_POINTS.find((point) => point.name === "Thighs")!;
    const theirs: Entry = {
      id: "01900000-0000-7000-8000-0000000000e0",
      workspaceId: "ws-test",
      meditationId: seededPointId(thigh.slot),
      symbolId: null,
      sortOrder: 40,
      archivedAt: null,
      revision: 1,
      updatedAt: 1,
    };
    const line: Intention = {
      id: "01900000-0000-7000-8000-0000000000e1",
      workspaceId: "ws-test",
      entryId: theirs.id,
      sortOrder: 0,
      text: "My own words about my thighs",
      archivedAt: null,
      revision: 1,
      updatedAt: 1,
    };
    const patch = withSeededPoints({
      ...old,
      entries: [...old.entries, theirs],
      intentions: [...old.intentions, line],
    });
    // Theirs is the row this point reads, so the seed's own row for it is not planted and
    // not one of its own sentences arrives.
    expect(patch.entries.map((row) => row.id)).not.toContain(seededPointEntryId(thigh.slot));
    expect(patch.entries.every((row) => row.meditationId !== seededPointId(thigh.slot))).toBe(
      true,
    );
    const planted = new Set(patch.entries.map((row) => row.id));
    expect(patch.intentions.some((row) => planted.has(row.entryId ?? ""))).toBe(true);
  });

  it("changes nothing on a device that is already right", () => {
    const ws = buildDefaultWorkspace("ws-test");
    expect(
      withSeededPoints({
        meditations: ws.meditations,
        entries: ws.entries,
        intentions: ws.intentions,
      }),
    ).toEqual({ meditations: [], entries: [], intentions: [] });
  });

  it("touches nothing at all in a store with no catalogue", () => {
    expect(withSeededPoints({ meditations: [], entries: [], intentions: [] })).toEqual({
      meditations: [],
      entries: [],
      intentions: [],
    });
  });

  it("keeps every id it plants in the seeded slot range", () => {
    // A repair mints ids a *second* device will recognise, so they have to be the seed's
    // own shape rather than anything minted per install.
    const patch = withSeededPoints(asTheOldSeed());
    for (const row of [...patch.meditations, ...patch.entries, ...patch.intentions]) {
      expect(row.id.startsWith("01900000-0000-7000-8000-")).toBe(true);
    }
    expect(patch.entries[0]?.id).toBe(seededPointEntryId(SEEDED_POINTS[0]!.slot));
    expect(patch.entries[0]?.id).not.toBe(nid(0x300));
  });
});

/**
 * The owner's round 22: *"yes, they were meant as 2 different points."* One of round 21's
 * twelve rows was two places written as one, so the seed writes thirteen and v32 splits it.
 *
 * The fixture is a device that ran v31 — the combined row, the combined sentences, no
 * `Thymus` — which is the owner's own device, and the whole point of the gates below.
 */
describe("`Thyroid and thymus` was two points", () => {
  /** The words round 21 wrote, kept verbatim so the repair has something to recognise. */
  const COMBINED = [
    "My thyroid and my thymus have been healed whole and complete",
    "My body's rhythm has settled, and my defences are strong and calm",
  ];

  function asRound21() {
    const ws = buildDefaultWorkspace("ws-test");
    const slot = seededPointSlotFor("Thyroid")!;
    const thymus = SEEDED_POINTS.find((point) => point.name === "Thymus")!;
    const id = seededPointId(slot);
    const entryId = seededPointEntryId(slot);
    return {
      ws,
      id,
      entryId,
      thymus,
      meditations: ws.meditations
        .filter((row) => row.id !== seededPointId(thymus.slot))
        .map((row) =>
          row.id === id
            ? {
                ...row,
                name: "Thyroid and thymus",
                locationText: "The throat and the upper chest",
              }
            : row,
        ),
      entries: ws.entries.filter((row) => row.meditationId !== seededPointId(thymus.slot)),
      intentions: ws.intentions.map((line) =>
        line.entryId === entryId ? { ...line, text: COMBINED[line.sortOrder] ?? line.text } : line,
      ),
    };
  }

  it("renames the row the app wrote, and plants `Thymus` beside it", () => {
    const old = asRound21();
    const split = splitThyroidAndThymus(old);

    expect(split.meditations.map((row) => row.name)).toEqual(["Thyroid"]);
    expect(split.meditations[0]?.id, "the id does not move").toBe(old.id);
    expect(split.meditations[0]?.locationText).toBe("The base of the throat");
    expect(
      split.intentions.map((row) => row.text),
      "and the app's own sentences are split with it",
    ).toEqual([...SEEDED_POINTS.find((point) => point.name === "Thyroid")!.sentences]);

    const renamed = new Map(split.meditations.map((row) => [row.id, row]));
    const patch = withSeededPoints({
      meditations: old.meditations.map((row) => renamed.get(row.id) ?? row),
      entries: old.entries,
      intentions: old.intentions,
    });

    const planted = patch.meditations.filter((row) => row.name === "Thymus");
    expect(planted.length).toBe(1);
    expect(planted[0]?.id).toBe(seededPointId(old.thymus.slot));
    const thyroid = old.meditations.find((row) => row.id === old.id)!;
    expect(planted[0]?.sortOrder, "immediately after `Thyroid`").toBe(thyroid.sortOrder + 1);
    // Every row that sat at or after that place moved up by one, so the reader's own order
    // comes out exactly as it went in.
    const moved = old.meditations.filter((row) => row.sortOrder > thyroid.sortOrder);
    expect(moved.length).toBeGreaterThan(0);
    for (const row of moved) {
      expect(
        patch.meditations.find((other) => other.id === row.id)?.sortOrder,
        `${row.name} moved up one`,
      ).toBe(row.sortOrder + 1);
    }
    // And the thirteenth point carries what every other point carries.
    const entry = patch.entries.find((row) => row.meditationId === planted[0]!.id);
    expect(entry?.id).toBe(seededPointEntryId(old.thymus.slot));
    expect(
      patch.intentions.filter((row) => row.entryId === entry?.id).map((row) => row.text),
    ).toEqual([...old.thymus.sentences]);
  });

  it("keeps a reader's own name, words and rows", () => {
    const old = asRound21();

    // Words the reader has written in are theirs: the name still moves, the sentences stay.
    const theirs = splitThyroidAndThymus({
      ...old,
      intentions: old.intentions.map((line) =>
        line.entryId === old.entryId ? { ...line, text: "My own words about my throat" } : line,
      ),
    });
    expect(theirs.meditations.map((row) => row.name)).toEqual(["Thyroid"]);
    expect(theirs.intentions).toEqual([]);

    // A row they renamed is not the app's row any more, so nothing happens to it at all.
    expect(
      splitThyroidAndThymus({
        ...old,
        meditations: old.meditations.map((row) =>
          row.id === old.id ? { ...row, name: "My throat" } : row,
        ),
      }),
    ).toEqual({ meditations: [], intentions: [] });

    // A reader who already has a point of their own called `Thyroid` is not given a second.
    const taken = {
      ...old.meditations.find((row) => row.id === old.id)!,
      id: "01900000-0000-7000-8000-0000000000d0",
      name: "Thyroid",
    };
    expect(
      splitThyroidAndThymus({ ...old, meditations: [...old.meditations, taken] }),
    ).toEqual({ meditations: [], intentions: [] });

    // And it is idempotent: the row it renamed is not renamed again.
    const once = splitThyroidAndThymus(old);
    const renamed = new Map(once.meditations.map((row) => [row.id, row]));
    expect(
      splitThyroidAndThymus({
        ...old,
        meditations: old.meditations.map((row) => renamed.get(row.id) ?? row),
      }).meditations,
    ).toEqual([]);
  });
});

/**
 * The owner's round 25: *"There should be 2 seperate points called pancreas and spleen. All the
 * records for both the points will need to be created."* Round 21 wrote the pair as one row, so
 * the seed writes fourteen body points and v34 splits it — and `Spleen` is the whole of a
 * point: its own row, its own symbol-less row with its sentences, and its four reiki bindings.
 *
 * The fixture is the store a device that has run v33 holds: the combined row, the combined
 * sentences, no `Spleen`.
 */
describe("`Pancreas and spleen` is two points", () => {
  /** The words round 21 wrote, kept verbatim so the repair has something to recognise. */
  const COMBINED = [
    "My pancreas and my spleen have been healed whole and complete",
    "My digestion and my immunity have settled into a calm and steady strength",
  ];

  function asRound24() {
    const ws = buildDefaultWorkspace("ws-test");
    const slot = seededPointSlotFor("Pancreas")!;
    const spleen = SEEDED_POINTS.find((point) => point.name === "Spleen")!;
    const id = seededPointId(slot);
    const entryId = seededPointEntryId(slot);
    return {
      ws,
      id,
      entryId,
      spleen,
      meditations: ws.meditations
        .filter((row) => row.id !== seededPointId(spleen.slot))
        .map((row) =>
          row.id === id
            ? { ...row, name: "Pancreas and spleen", locationText: "The upper abdomen" }
            : row,
        ),
      entries: ws.entries.filter((row) => row.meditationId !== seededPointId(spleen.slot)),
      // The lines go with the rows they belong to: a store that never held `Spleen` holds none
      // of its sentences either, so a repair that plants them mints each one exactly once.
      intentions: ws.intentions
        .filter((line) => line.entryId !== seededPointEntryId(spleen.slot))
        .map((line) =>
          line.entryId === entryId ? { ...line, text: COMBINED[line.sortOrder] ?? line.text } : line,
        ),
    };
  }

  /** The store the two halves of the repair leave behind: the split, then the planting walk. */
  function repaired(old: ReturnType<typeof asRound24>) {
    const split = splitPancreasAndSpleen(old);
    const renamed = new Map(split.meditations.map((row) => [row.id, row]));
    const current = old.meditations.map((row) => renamed.get(row.id) ?? row);
    const lines = old.intentions.map(
      (row) => split.intentions.find((change) => change.id === row.id) ?? row,
    );
    const points = withSeededPoints({
      meditations: current,
      entries: old.entries,
      intentions: lines,
    });
    const planted = [...old.entries, ...points.entries];
    const bindings = withReikiBindings({
      meditations: [...current, ...points.meditations],
      symbols: old.ws.symbols,
      entries: planted,
    });
    // Every entry row the repair leaves behind: the ones that were already there, the ones
    // the planting walk added, and the bindings it bound.
    const entries = [...planted, ...bindings.entries];
    return { split, current, points, entries, bindings, lines };
  }

  it("renames the row the app wrote, and plants `Spleen` beside it", () => {
    const old = asRound24();
    const { split, points, entries, lines } = repaired(old);

    expect(split.meditations.map((row) => row.name)).toEqual(["Pancreas"]);
    expect(split.meditations[0]?.id, "the id does not move").toBe(old.id);
    expect(split.meditations[0]?.locationText).toBe("The upper abdomen, behind the stomach");
    expect(
      split.intentions.map((row) => row.text),
      "and the app's own sentences are split with it",
    ).toEqual([...SEEDED_POINTS.find((point) => point.name === "Pancreas")!.sentences]);

    const planted = points.meditations.find((row) => row.id === seededPointId(old.spleen.slot));
    expect(planted?.name).toBe("Spleen");
    const pancreas = old.meditations.find((row) => row.id === old.id)!;
    expect(planted?.sortOrder, "immediately after `Pancreas`").toBe(pancreas.sortOrder + 1);
    // Every row that sat at or after that place moved up by one, so the reader's own order
    // comes out exactly as it went in.
    const moved = old.meditations.filter((row) => row.sortOrder > pancreas.sortOrder);
    expect(moved.length).toBeGreaterThan(0);
    for (const row of moved) {
      expect(
        points.meditations.find((other) => other.id === row.id)?.sortOrder,
        `${row.name} moved up one`,
      ).toBe(row.sortOrder + 1);
    }

    // And the new point carries everything a point carries: its own symbol-less row with its
    // sentences, and the four reiki bindings.
    const own = entries.filter(
      (row) => row.meditationId === planted!.id && row.symbolId === null,
    );
    expect(own).toHaveLength(1);
    expect(own[0]?.id).toBe(seededPointEntryId(old.spleen.slot));
    const ownLines = [...lines, ...points.intentions]
      .filter((row) => row.entryId === own[0]!.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((row) => row.text);
    expect(ownLines).toEqual([...old.spleen.sentences]);
    expect(
      entries.filter((row) => row.meditationId === planted!.id && row.symbolId !== null),
    ).toHaveLength(BOUND_SYMBOL_SLOTS.length);
  });

  it("gives both points the records a fresh seed does, id for id", () => {
    // The whole of *"All the records for both the points will need to be created"*: the two
    // points a repaired device ends up with are the two a fresh seed writes — the same rows,
    // the same ids, the same words, the same bindings.
    const old = asRound24();
    const { current, points, entries, lines } = repaired(old);
    const fresh = buildDefaultWorkspace("ws-test");
    const everything: Entry[] = entries;
    const repairedPoints = [...current, ...points.meditations];
    const allLines: Intention[] = [...lines, ...points.intentions];

    for (const name of ["Pancreas", "Spleen"]) {
      const id = seededPointId(seededPointSlotFor(name)!);
      const seeded = fresh.meditations.find((row) => row.id === id)!;
      const mine = repairedPoints.find((row) => row.id === id)!;
      expect(mine.name, name).toBe(seeded.name);
      expect(mine.locationText, name).toBe(seeded.locationText);
      expect(mine.stages, name).toEqual(seeded.stages);
      expect(mine.defaultDurationMs, name).toBe(seeded.defaultDurationMs);

      const ownOf = (rows: readonly Entry[]) =>
        rows.filter((row) => row.meditationId === id && row.symbolId === null);
      const bindingsOf = (rows: readonly Entry[]) =>
        rows
          .filter((row) => row.meditationId === id && row.symbolId !== null)
          .map((row) => row.id)
          .sort();
      expect(ownOf(everything).map((row) => row.id), `${name}'s own row`).toEqual(
        ownOf(fresh.entries).map((row) => row.id),
      );
      const textsFor = (lines: readonly Intention[], entryId: string) =>
        lines
          .filter((row) => row.entryId === entryId)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((row) => row.text);
      expect(
        textsFor(allLines, ownOf(everything)[0]!.id),
        `${name}'s sentences`,
      ).toEqual(textsFor(fresh.intentions, ownOf(fresh.entries)[0]!.id));
      expect(bindingsOf(everything), `${name}'s four symbols`).toEqual(
        bindingsOf(fresh.entries),
      );
    }
  });

  it("keeps a reader's own name, words and rows", () => {
    const old = asRound24();

    // Words the reader has written in are theirs: the name still moves, the sentences stay.
    const theirs = splitPancreasAndSpleen({
      ...old,
      intentions: old.intentions.map((line) =>
        line.entryId === old.entryId ? { ...line, text: "My own words about my pancreas" } : line,
      ),
    });
    expect(theirs.meditations.map((row) => row.name)).toEqual(["Pancreas"]);
    expect(theirs.intentions).toEqual([]);

    // A row they renamed is not the app's row any more, so nothing happens to it at all.
    expect(
      splitPancreasAndSpleen({
        ...old,
        meditations: old.meditations.map((row) =>
          row.id === old.id ? { ...row, name: "My pancreas and spleen" } : row,
        ),
      }),
    ).toEqual({ meditations: [], intentions: [] });

    // A reader who already has a point of their own called `Spleen` is not given a second.
    const taken: Meditation = {
      ...old.meditations.find((row) => row.id === old.id)!,
      id: "01900000-0000-7000-8000-0000000000d1",
      name: "Spleen",
    };
    expect(splitPancreasAndSpleen({ ...old, meditations: [...old.meditations, taken] })).toEqual({
      meditations: [],
      intentions: [],
    });

    // And it is idempotent: the row it renamed is not renamed again.
    const once = splitPancreasAndSpleen(old);
    const renamed = new Map(once.meditations.map((row) => [row.id, row]));
    expect(
      splitPancreasAndSpleen({
        ...old,
        meditations: old.meditations.map((row) => renamed.get(row.id) ?? row),
      }).meditations,
    ).toEqual([]);
  });
});
