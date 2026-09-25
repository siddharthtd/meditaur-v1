import {
  POINT_TYPE_ID,
  type Entry,
  type Intention,
  type Meditation,
} from "@meditaur/domain";
import { FOCUS_ORDER, normaliseName, rankOf } from "./catalog-order.ts";
import { nid, stagesForType } from "./seeded-ids.ts";

/**
 * The body points the owner listed (round 21), and what is written about them.
 *
 * The owner's list holds fourteen items; `Liver` and `Kidneys` are already seeded as points
 * (`nid(0x27)`, `nid(0x28)`), so twelve were missing. The owner said *"thirteen"*, and round
 * 22 settled it: `Thyroid and thymus` is **two** places. Round 25 split the one remaining
 * pair the same way — *"There should be 2 seperate points called pancreas and spleen. All the
 * records for both the points will need to be created"* — so the seed writes fourteen rows,
 * and every one of them carries the whole of a point: its own row, its own symbol-less row
 * with its sentences, and its four reiki bindings.
 * The names are spelled exactly as `FOCUS_ORDER` lists them, which is the owner's own order —
 * head, then chest, then the organs, then down to the feet — because a name is the only
 * handle on a row that already exists, and the order is what the Points tab reads in.
 *
 * The sentences are the app's voice in the **present perfect**, the shape the owner asked
 * for: *"Construct sentences for all of these in present perfect tense like - 'My eyes have
 * been healed whole and complete. My vision has improved manifold'."* The first of them is
 * the owner's own example, kept word for word.
 *
 * The rows live here rather than in `default-workspace.ts` because **two** callers need the
 * same rows with the same ids: the seed, which plants them, and the Dexie versions that carry
 * a seeded change to a device which already has a catalogue. Ids are derived from the point's
 * own slot rather than from a running counter, so the callers cannot disagree — and adding
 * rows here never moves an id the seed already handed out. That last part is why `Thymus`,
 * which reads beside `Thyroid`, sits at the **end** of the array below: `seeded-bindings.ts`
 * derives a binding's id from a row's *index* there, so a point written in the middle would
 * move every binding id after it. Where a row **reads** is its `sortOrder`, and both callers
 * take that from `pointsInCatalogueOrder()`.
 */

/** A body point's own length, the same 5:00 the two seeded organs carry. */
export const ORGAN_DURATION_MS = 300_000;

/** Where the points' own slots begin: `nid(0x50)` is the first, the appended 0x5c the last. */
const POINT_SLOT_BASE = 0x50;
/** The symbol-less entry that carries a point's sentences. */
const POINT_ENTRY_SLOT_BASE = 0x500;
/** Its sentences. Eight apiece, which is more than one point has ever needed. */
const POINT_LINE_SLOT_BASE = 0x600;
const LINES_PER_POINT = 8;

export type SeededPoint = {
  /** The slot the row's id and its children's ids are derived from. */
  slot: number;
  /** The name, spelled as `FOCUS_ORDER` lists it. */
  name: string;
  /** Where it is, as the owner would say it. The two seeded organs say "Lower back". */
  locationText: string;
  /** What is written about it, in the reader's order. */
  sentences: readonly string[];
};

export const SEEDED_POINTS: readonly SeededPoint[] = [
  {
    slot: 0x50,
    name: "Eyes",
    locationText: "The eyes",
    sentences: [
      "My eyes have been healed whole and complete. My vision has improved manifold",
      "My eyes see clearly, near and far, and they rest in comfort",
    ],
  },
  {
    slot: 0x51,
    name: "Temples",
    locationText: "The temples",
    sentences: [
      "My temples have been healed whole and complete. The pressure in them has dissolved",
      "My head has cleared, and peace has taken the place of every ache",
    ],
  },
  {
    slot: 0x52,
    name: "Ears",
    locationText: "The ears",
    sentences: [
      "My ears have been healed whole and complete. My hearing is clear, balanced and whole",
      "Every ringing and every noise in my head has been silenced",
    ],
  },
  {
    slot: 0x53,
    name: "Thyroid",
    locationText: "The base of the throat",
    sentences: [
      "My thyroid has been healed whole and complete",
      "My body's rhythm has settled, and my energy is steady and calm",
    ],
  },
  {
    slot: 0x54,
    name: "Shoulders",
    locationText: "The shoulders",
    sentences: [
      "My shoulders have been healed whole and complete. Every burden carried there has been lifted",
      "My shoulders are loose, light and at ease",
    ],
  },
  {
    slot: 0x55,
    name: "Tips of the lungs",
    locationText: "The tips of the lungs",
    sentences: [
      "The tips of my lungs have been healed whole and complete. My breath has deepened",
      "My chest has opened, and every breath arrives full and easy",
    ],
  },
  {
    slot: 0x56,
    name: "Pancreas",
    locationText: "The upper abdomen, behind the stomach",
    sentences: [
      "My pancreas has been healed whole and complete",
      "My digestion and my blood sugar have settled into a calm and steady balance",
    ],
  },
  {
    slot: 0x57,
    name: "Thighs",
    locationText: "The thighs",
    sentences: [
      "My thighs have been healed whole and complete. My strength has returned to them",
      "They carry me without effort, and they are at peace",
    ],
  },
  {
    slot: 0x58,
    name: "Knees",
    locationText: "The knees",
    sentences: [
      "My knees have been healed whole and complete. They bend freely and they stand firm",
      "Every step I take has become even and sure",
    ],
  },
  {
    slot: 0x59,
    name: "Lower legs",
    locationText: "The lower legs",
    sentences: [
      "My lower legs have been healed whole and complete. They are light and full of strength",
      "They move me forward easily, and they have been freed of every tightness",
    ],
  },
  {
    slot: 0x5a,
    name: "Ankles",
    locationText: "The ankles",
    sentences: [
      "My ankles have been healed whole and complete. They are steady and they hold me well",
      "I move with balance in every direction",
    ],
  },
  {
    slot: 0x5b,
    name: "Soles of the feet",
    locationText: "The soles of the feet",
    sentences: [
      "My soles have been healed whole and complete",
      "I stand grounded, and every step I take lands well",
    ],
  },
  // The thirteenth, split out of `Thyroid and thymus` when the owner said those were two
  // points (round 22). Appended rather than written beside `Thyroid` because a binding's id
  // is derived from a row's index in this array; where it *reads* is `sortOrder`, and both
  // callers take that from `pointsInCatalogueOrder()`.
  {
    slot: 0x5c,
    name: "Thymus",
    locationText: "The upper chest",
    sentences: [
      "My thymus has been healed whole and complete",
      "My defences are strong and calm, and my chest is at ease",
    ],
  },
  // The fourteenth, split out of `Pancreas and spleen` when the owner said those were two
  // points (round 25). Appended for the same reason `Thymus` is — a binding's id is derived
  // from a row's index here — and where it *reads* is its `sortOrder`, taken from
  // `pointsInCatalogueOrder()` by both the seed and the repair.
  {
    slot: 0x5d,
    name: "Spleen",
    locationText: "The upper left abdomen",
    sentences: [
      "My spleen has been healed whole and complete",
      "My immunity is strong and quiet, and my blood is clean",
    ],
  },
];

/** Every slot a seeded body point occupies, the fourteen here plus the two organs. */
export const SEEDED_POINT_SLOTS: readonly number[] = [
  0x27,
  0x28,
  ...SEEDED_POINTS.map((point) => point.slot),
];

/**
 * The points in the order they **read**, which is `FOCUS_ORDER`'s and not this file's.
 *
 * The array above is in slot order, and a slot is half of an id (§ the module comment), so
 * it is append-only. `Thymus` and `Spleen` therefore sit at its end while they read among the
 * organs. A caller that plants rows takes the order from here: the seed, which numbers
 * the rows it writes, and `withSeededPoints`, which puts a missing point after the point the
 * catalogue lists before it rather than at the tail.
 */
export function pointsInCatalogueOrder(): readonly SeededPoint[] {
  return [...SEEDED_POINTS].sort(
    (a, b) => rankOf(FOCUS_ORDER, a.name) - rankOf(FOCUS_ORDER, b.name),
  );
}

/** The slot a point's own row has, or `null` for a name this seed does not know. */
export function seededPointSlotFor(name: string | null | undefined): number | null {
  const wanted = normaliseName(name);
  for (const point of SEEDED_POINTS) {
    if (normaliseName(point.name) === wanted) return point.slot;
  }
  return null;
}

/** The id of a seeded point's own row. */
export function seededPointId(slot: number): string {
  return nid(slot);
}

/** The id of the symbol-less row that carries a point's sentences. */
export function seededPointEntryId(slot: number): string {
  return nid(POINT_ENTRY_SLOT_BASE + (slot - POINT_SLOT_BASE));
}

/** The id of one sentence on a point's symbol-less row. */
export function seededPointLineId(slot: number, index: number): string {
  return nid(POINT_LINE_SLOT_BASE + (slot - POINT_SLOT_BASE) * LINES_PER_POINT + index);
}

/** One seeded point's own row, exactly as the seed builds it. */
export function seededPointRow(workspaceId: string, point: SeededPoint): Meditation {
  return {
    id: seededPointId(point.slot),
    workspaceId,
    name: point.name,
    typeId: POINT_TYPE_ID,
    locationText: point.locationText,
    defaultBinauralPresetId: null,
    defaultDurationMs: ORGAN_DURATION_MS,
    description: null,
    governs: null,
    colour: null,
    element: null,
    representationAssetId: null,
    representationDescription: null,
    binauralEnabled: true,
    stages: stagesForType(POINT_TYPE_ID),
    sortOrder: 0,
    archivedAt: null,
    revision: 0,
    updatedAt: 0,
  };
}

/**
 * A point's symbol-less row and the sentences written on it, from `firstSortOrder` on.
 *
 * A point's sentences live on the row that names **no** symbol: that is the row its
 * intentions stage reads (`focusIntentions` in the snapshot), and the row a sheet draws as
 * "on its own". The symbols bound to the point are separate rows and carry no sentences of
 * their own (`seeded-bindings.ts`).
 */
export function seededPointContent(
  workspaceId: string,
  points: readonly SeededPoint[],
  firstSortOrder: number,
): { entries: Entry[]; intentions: Intention[] } {
  const entries: Entry[] = [];
  const intentions: Intention[] = [];
  points.forEach((point, index) => {
    const entry: Entry = {
      id: seededPointEntryId(point.slot),
      workspaceId,
      meditationId: seededPointId(point.slot),
      symbolId: null,
      sortOrder: firstSortOrder + index,
      archivedAt: null,
      revision: 0,
      updatedAt: 0,
    };
    entries.push(entry);
    point.sentences.forEach((text, at) => {
      intentions.push({
        id: seededPointLineId(point.slot, at),
        workspaceId,
        entryId: entry.id,
        sortOrder: at,
        text,
        archivedAt: null,
        revision: 0,
        updatedAt: 0,
      });
    });
  });
  return { entries, intentions };
}

/** The name this point was written under until round 22 split it in two. */
const COMBINED_NAME = "Thyroid and thymus";
const COMBINED_LOCATION = "The throat and the upper chest";
/** The sentences round 21 wrote on it, kept only so the repair can recognise its own work. */
const COMBINED_SENTENCES: readonly string[] = [
  "My thyroid and my thymus have been healed whole and complete",
  "My body's rhythm has settled, and my defences are strong and calm",
];

/**
 * `Thyroid and thymus` is two points, and the owner said so (Dexie v32).
 *
 * The row the app wrote is renamed to `Thyroid` — its id stays exactly where it is, because
 * every other device knows it by that id — and `Thymus` is a new row beside it, planted by
 * `withSeededPoints`' own walk. One id is minted and none moves.
 *
 * Three gates keep a reader's own work out of it, all of them v24's rule and v30's shape
 * ("only while the row still looks like the one the app wrote"):
 *
 * - the name: a row the reader renamed is not touched, and a reader who already has a point
 *   of their own called `Thyroid` is not given a second one;
 * - the place: `locationText` is rewritten only while it is still the combined one;
 * - the sentences: rewritten only while they are the app's own words **on the ids the seed
 *   minted for them**. A reader who has written here keeps their words, which is what the
 *   owner meant by *"I will update the intentions for the points as and when required"*.
 *
 * Returns the rows to write, empty when there is nothing to do.
 */
export function splitThyroidAndThymus(input: {
  meditations: readonly Meditation[];
  entries: readonly Entry[];
  intentions: readonly Intention[];
}): { meditations: Meditation[]; intentions: Intention[] } {
  const empty = { meditations: [], intentions: [] };
  const slot = seededPointSlotFor("Thyroid");
  const thyroid = slot === null ? undefined : SEEDED_POINTS.find((row) => row.slot === slot);
  if (slot === null || !thyroid) return empty;

  const combined = normaliseName(COMBINED_NAME);
  const row =
    input.meditations.find((other) => other.id === seededPointId(slot)) ??
    input.meditations.find(
      (other) => other.typeId === POINT_TYPE_ID && normaliseName(other.name) === combined,
    );
  // Already split, already renamed by the reader, or not there at all: nothing to do.
  if (!row || normaliseName(row.name) !== combined) return empty;
  const taken = input.meditations.some(
    (other) =>
      other.id !== row.id &&
      other.typeId === POINT_TYPE_ID &&
      normaliseName(other.name) === normaliseName(thyroid.name),
  );
  if (taken) return empty;

  const meditations: Meditation[] = [
    {
      ...row,
      name: thyroid.name,
      locationText:
        row.locationText === COMBINED_LOCATION ? thyroid.locationText : row.locationText,
    },
  ];

  const intentions: Intention[] = [];
  for (const entry of input.entries) {
    if (entry.meditationId !== row.id || entry.symbolId !== null) continue;
    const lines = input.intentions
      .filter((line) => line.entryId === entry.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const ours =
      lines.length === COMBINED_SENTENCES.length &&
      lines.every(
        (line, at) =>
          line.id === seededPointLineId(slot, at) && line.text === COMBINED_SENTENCES[at],
      );
    if (!ours) continue;
    lines.forEach((line, at) => {
      intentions.push({ ...line, text: thyroid.sentences[at]! });
    });
  }

  return { meditations, intentions };
}

/** The name this point was written under until round 25 split it in two. */
const COMBINED_PANCREAS_NAME = "Pancreas and spleen";
const COMBINED_PANCREAS_LOCATION = "The upper abdomen";
/** The sentences round 21 wrote on it, kept only so the repair can recognise its own work. */
const COMBINED_PANCREAS_SENTENCES: readonly string[] = [
  "My pancreas and my spleen have been healed whole and complete",
  "My digestion and my immunity have settled into a calm and steady strength",
];

/**
 * `Pancreas and spleen` is two points, and the owner said so (Dexie v34).
 *
 * The same shape as round 22's split of `Thyroid and thymus`: the row the app wrote is renamed
 * to `Pancreas` — its id stays exactly where it is, because every other device knows it by that
 * id — and `Spleen` is a new row beside it, planted by `withSeededPoints`' own walk. Every
 * record a point carries is minted there: its own symbol-less row, its sentences, and its four
 * reiki bindings.
 *
 * Three gates keep a reader's own work out of it, all of them v24's rule and v30's shape:
 *
 * - the name: a row the reader renamed is not touched, and a reader who already has a point of
 *   their own called `Pancreas` or `Spleen` is not given a second one;
 * - the place: `locationText` is rewritten only while it is still the combined one;
 * - the sentences: rewritten only while they are the app's own words **on the ids the seed
 *   minted for them**. A reader who has written here keeps their words, which is what the owner
 *   meant by *"I will update the intentions for the points as and when required"*.
 *
 * Returns the rows to write, empty when there is nothing to do.
 */
export function splitPancreasAndSpleen(input: {
  meditations: readonly Meditation[];
  entries: readonly Entry[];
  intentions: readonly Intention[];
}): { meditations: Meditation[]; intentions: Intention[] } {
  const empty = { meditations: [], intentions: [] };
  const slot = seededPointSlotFor("Pancreas");
  const pancreas = slot === null ? undefined : SEEDED_POINTS.find((row) => row.slot === slot);
  const spleen = SEEDED_POINTS.find((row) => row.name === "Spleen");
  if (slot === null || !pancreas || !spleen) return empty;

  const combined = normaliseName(COMBINED_PANCREAS_NAME);
  const row =
    input.meditations.find((other) => other.id === seededPointId(slot)) ??
    input.meditations.find(
      (other) => other.typeId === POINT_TYPE_ID && normaliseName(other.name) === combined,
    );
  // Already split, already renamed by the reader, or not there at all: nothing to do.
  if (!row || normaliseName(row.name) !== combined) return empty;
  const taken = input.meditations.some(
    (other) =>
      other.id !== row.id &&
      other.typeId === POINT_TYPE_ID &&
      (normaliseName(other.name) === normaliseName(pancreas.name) ||
        normaliseName(other.name) === normaliseName(spleen.name)),
  );
  if (taken) return empty;

  const meditations: Meditation[] = [
    {
      ...row,
      name: pancreas.name,
      locationText:
        row.locationText === COMBINED_PANCREAS_LOCATION ? pancreas.locationText : row.locationText,
    },
  ];

  const intentions: Intention[] = [];
  for (const entry of input.entries) {
    if (entry.meditationId !== row.id || entry.symbolId !== null) continue;
    const lines = input.intentions
      .filter((line) => line.entryId === entry.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const ours =
      lines.length === COMBINED_PANCREAS_SENTENCES.length &&
      lines.every(
        (line, at) =>
          line.id === seededPointLineId(slot, at) &&
          line.text === COMBINED_PANCREAS_SENTENCES[at],
      );
    if (!ours) continue;
    lines.forEach((line, at) => {
      intentions.push({ ...line, text: pancreas.sentences[at]! });
    });
  }

  return { meditations, intentions };
}

/** The workspace the rows in a device's tables belong to, or `null` for an empty store. */
function workspaceOf(rows: readonly { workspaceId: string }[]): string | null {
  return rows[0]?.workspaceId ?? null;
}

/**
 * The points, carried to a device that already has a catalogue (Dexie v31, and v32's split).
 *
 * The rule is v24's, and it is what makes this safe on a device a reader has been using:
 *
 * - a point is matched by its **seeded id first**, and failing that by its **name** among the
 *   points already stored. The owner created a point called `Thighs` by hand in round 20 —
 *   that row *is* the point, so the sentences are attached to it rather than a second
 *   `Thighs` being planted beside it, and none of the reader's own fields are touched;
 * - a symbol-less row is added only when the point has none. A row that is already there is
 *   left exactly as it is: it may hold the reader's own sentences, and a repair is for what
 *   the app got wrong, never for what the reader chose;
 * - a point that has to be planted goes **where it reads**: directly after the point the
 *   catalogue lists before it, when that row is there, and at the tail otherwise. Appending
 *   would have put `Thymus` under `Soles of the feet` while the list says it sits beside
 *   `Thyroid`. The rows at and after the insertion point move up by one, so the reader's own
 *   order — rows this seed never minted included — is kept exactly;
 * - nothing is ever removed, and a device with no catalogue is untouched.
 *
 * Returns the rows to write: the points planted, and the existing rows a shift moved. Empty
 * when there is nothing to do.
 */
export function withSeededPoints(input: {
  meditations: readonly Meditation[];
  entries: readonly Entry[];
  intentions: readonly Intention[];
}): { meditations: Meditation[]; entries: Entry[]; intentions: Intention[] } {
  const workspaceId = workspaceOf(input.meditations);
  if (!workspaceId) return { meditations: [], entries: [], intentions: [] };

  // The store as it now stands, copied: planting a point between two rows moves the rows
  // after it along, and nothing the caller handed in may be disturbed by that.
  const state = input.meditations.map((row) => ({ ...row }));
  const changed = new Map<string, Meditation>();
  const byName = new Map(
    state
      .filter((row) => row.typeId === POINT_TYPE_ID)
      .map((row) => [normaliseName(row.name), row]),
  );
  const tail = () => state.reduce((high, row) => Math.max(high, row.sortOrder), -1) + 1;
  const place = (row: Meditation, at: number): Meditation => {
    for (const other of state) {
      if (other.sortOrder < at) continue;
      other.sortOrder += 1;
      changed.set(other.id, { ...other });
    }
    const placed = { ...row, sortOrder: at };
    state.push(placed);
    changed.set(placed.id, { ...placed });
    return placed;
  };

  const addedEntries: Entry[] = [];
  const addedIntentions: Intention[] = [];
  let nextOrder =
    input.entries.reduce((high, row) => Math.max(high, row.sortOrder), -1) + 1;
  // A slot a device already spent on something else is left alone rather than overwritten.
  const takenEntryIds = new Set(input.entries.map((row) => row.id));

  const catalogue = pointsInCatalogueOrder();
  catalogue.forEach((point, at) => {
    const id = seededPointId(point.slot);
    let target = state.find((row) => row.id === id);
    target ??= byName.get(normaliseName(point.name));
    if (!target) {
      const row = seededPointRow(workspaceId, point);
      const before = at > 0 ? catalogue[at - 1] : undefined;
      const anchor = before
        ? (state.find((other) => other.id === seededPointId(before.slot)) ??
          byName.get(normaliseName(before.name)))
        : undefined;
      target = place(row, anchor ? anchor.sortOrder + 1 : tail());
    }

    const carries = input.entries.some(
      (row) => row.meditationId === target.id && row.symbolId === null,
    );
    const entryId = seededPointEntryId(point.slot);
    if (carries || takenEntryIds.has(entryId)) return;

    const content = seededPointContent(workspaceId, [point], nextOrder);
    nextOrder += 1;
    // The entry has to name the row that is really there — the reader's own point may carry
    // an id this seed never minted.
    addedEntries.push({ ...content.entries[0]!, meditationId: target.id });
    addedIntentions.push(...content.intentions);
  });

  return {
    meditations: [...changed.values()],
    entries: addedEntries,
    intentions: addedIntentions,
  };
}
