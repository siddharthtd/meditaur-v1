import {
  CHAKRA_TYPE_ID,
  classicBinauralPair,
  copyStages,
  defaultEarEq,
  DEFAULT_ALARM_ENABLED,
  DEFAULT_PLAN_DISPLAY,
  DEFAULT_REIKI_SYSTEM,
  POINT_TYPE_ID,
  PROTECTION_TYPE_ID,
  SEEDED_MEDITATION_TYPES,
  SEEDED_REIKI_SYMBOLS,
  THANKS_GIVING_TYPE_ID,
  type BinauralPreset,
  type Entry,
  type FieldDef,
  type FieldOption,
  type Meditation,
  type Intention,
  type MeditationType,
  type Plan,
  type PlanBlock,
  type ReikiSystem,
  type Symbol,
} from "@meditaur/domain";
import {
  BOUND_SYMBOL_SLOTS,
  seededBindingsFor,
  seededMeditationSlotFor,
} from "./seeded-bindings.ts";
import { nid, stagesForType } from "./seeded-ids.ts";
import { pointsCircuit } from "./seeded-plans.ts";
import {
  ORGAN_DURATION_MS,
  SEEDED_POINTS,
  pointsInCatalogueOrder,
  seededPointContent,
  seededPointId,
  seededPointRow,
} from "./seeded-points.ts";

export { ORGAN_DURATION_MS };

export const DEFAULT_PLAN_NAME = "Chakra circuit";
export const CHAKRA_DURATION_MS = 420_000;
export const PROTECTION_DURATION_MS = 671_000;
// Thanks Giving is one affirmations stage of 1:00, which is its whole length
// (§12.10) — the same 60 s `AFFIRMATION_STAGES` holds, written out because the
// other seeded durations are seed values the owner tunes rather than arithmetic.
// It was 3:00 until the owner's round 20.
export const THANKS_GIVING_DURATION_MS = 60_000;
// `COOLOFF_DURATION_MS` went with the block kind it seeded (the owner's round 15,
// 2026-09-19): every seeded block is a meditation now, and its length is its stages'.
export const DEFAULT_PLAN_ID = "01900000-0000-7000-8000-000000000040";
/**
 * The seeded circuit's **Crown** block, by the id the seed gives it (`nid(0x200 + 7)`, the
 * eighth of the nine).
 *
 * It is named rather than derived at the call site because a repair has to remove *that*
 * block from a device that already seeded itself, and the rule for doing so is "the block
 * the app planted" rather than "every block that names Crown" (`seeded-circuit.ts`). Crown
 * left the seeded plan in the owner's round 20; the constant stays for the devices that
 * still hold it.
 */
export const SEEDED_CROWN_BLOCK_ID = nid(0x207);
/**
 * The seeded **Crown Chakra** meditation, by the id the seed gives it (`nid(0x26)`).
 *
 * It is named for the same reason the block is: a repair matches a block by *both* halves,
 * so a plan's own block that happens to carry the seeded block's number is not mistaken
 * for the one the app planted.
 */
export const SEEDED_CROWN_ID = nid(0x26);

const GAIN = 0.45;
const FADE_MS = 40;

function preset(
  workspaceId: string,
  id: number,
  name: string,
  carrierHz: number,
  beatHz: number,
): BinauralPreset {
  const pair = classicBinauralPair(carrierHz, beatHz, GAIN);
  return {
    id: nid(id),
    workspaceId,
    name,
    leftTones: [pair.left],
    rightTones: [pair.right],
    fadeInMs: FADE_MS,
    fadeOutMs: FADE_MS,
    eqLeft: defaultEarEq(),
    eqRight: defaultEarEq(),
    sortOrder: 0,
    archivedAt: null,
    // Seeded rows start unversioned, like every other first write: the revision
    // is what a later sync compares, and there is nothing to compare yet.
    revision: 0,
    updatedAt: 0,
  };
}

function focus(
  workspaceId: string,
  id: number,
  name: string,
  typeId: string,
  locationText: string,
  durationMs: number,
  presetId: string | null,
): Meditation {
  return {
    id: nid(id),
    workspaceId,
    name,
    typeId,
    locationText,
    defaultBinauralPresetId: presetId,
    defaultDurationMs: durationMs,
    description: null,
    governs: null,
    colour: null,
    element: null,
    representationAssetId: null,
    representationDescription: null,
    binauralEnabled: true,
    // Its own copy of its type's template, which the owner will tune one row at a
    // time later. A copy rather than a reference: editing the type must not move a
    // meditation's timers, and editing a meditation must not move the type's.
    stages: stagesForType(typeId),
    sortOrder: 0,
    archivedAt: null,
    revision: 0,
    updatedAt: 0,
  };
}

function symbol(
  workspaceId: string,
  id: number,
  name: string,
  description: string,
  usage: string,
  reikiSystem: ReikiSystem = DEFAULT_REIKI_SYSTEM,
): Symbol {
  return {
    id: nid(id),
    workspaceId,
    name,
    description,
    usage,
    imageAssetId: null,
    // Every seeded symbol names its system (the owner's round 16, §2.5). The
    // default is the one system the app shipped until then, so the eight rows
    // declared below need not repeat it; only the four new ones differ.
    reikiSystem,
    sortOrder: 0,
    archivedAt: null,
    revision: 0,
    updatedAt: 0,
  };
}

/**
 * One of the four rows the owner added (§2.5), built from the list the three
 * mirrors share.
 *
 * Their text is **empty**, deliberately: the owner said they will fill the
 * Description and the Usage in from the Database, so seeding a placeholder would
 * only be something to delete.
 */
function addedSymbol(
  workspaceId: string,
  row: { id: string; name: string; reikiSystem: ReikiSystem },
): Symbol {
  return {
    id: row.id,
    workspaceId,
    name: row.name,
    description: "",
    usage: "",
    imageAssetId: null,
    reikiSystem: row.reikiSystem,
    sortOrder: 0,
    archivedAt: null,
    revision: 0,
    updatedAt: 0,
  };
}

function meditationBlock(id: string, sortOrder: number, point: Meditation): PlanBlock {
  return {
    id,
    sortOrder,
    // The meditation's own copy of its stages, so the seeded plan runs what the
    // seeded rows say rather than what a type said when the plan was made.
    stages: copyStages(point.stages ?? stagesForType(point.typeId)),
    meditationIds: [point.id],
    symbolId: null,
    symbolScope: "all",
    binauralPresetId: point.defaultBinauralPresetId,
    ambientAssetId: null,
    alarmAssetId: null,
    // The seeded blocks take the plan's answers: a plan the reader has not edited
    // behaves exactly as it did, and the block editor is where one meditation
    // disagrees with its siblings. The randomiser joins them as `null` — a seeded block
    // reads every line, which is what a reader who never asks for a draw gets.
    alarmEnabled: null,
    display: null,
    intentionRandomiser: null,
  };
}

export type DefaultWorkspace = {
  meditationTypes: MeditationType[];
  meditations: Meditation[];
  symbols: Symbol[];
  entries: Entry[];
  intentions: Intention[];
  fieldDefs: FieldDef[];
  fieldOptions: FieldOption[];
  presets: BinauralPreset[];
  /**
   * Every plan a fresh device starts with: the chakra circuit, and the points circuit the
   * owner asked for in round 22 — *"I want to introduce another plan for a points circuit"*.
   *
   * A list rather than one plan because a second one is the ask; the chakra circuit stays
   * first and stays what `lastPlanId` names, so a reader who has never opened the planner
   * sees exactly what they saw before.
   */
  plans: Plan[];
};

export function buildDefaultWorkspace(workspaceId: string): DefaultWorkspace {
  // The types come first because everything else points at them. Their ids are the
  // constants the domain exports, so the seed and the app agree about which row
  // "the Chakra type" is without either matching on a name a reader can rename.
  const meditationTypes: MeditationType[] = SEEDED_MEDITATION_TYPES.map((row, sortOrder) => ({
    id: row.id,
    workspaceId,
    name: row.name,
    stages: copyStages(row.stages),
    sortOrder,
    archivedAt: null,
    revision: 0,
    updatedAt: 0,
  }));
  const solfeggioThirdEye = preset(workspaceId, 0x70, "Solfeggio Third-Eye 852/8", 852, 8);
  const solfeggioThroat = preset(workspaceId, 0x71, "Solfeggio Throat 741/8", 741, 8);
  const solfeggioHeart = preset(workspaceId, 0x72, "Solfeggio Heart 639/8", 639, 8);
  const solfeggioSolar = preset(workspaceId, 0x73, "Solfeggio Solar Plexus 528/8", 528, 8);
  const solfeggioHara = preset(workspaceId, 0x74, "Solfeggio Hara 417/8", 417, 8);
  const solfeggioRoot = preset(workspaceId, 0x75, "Solfeggio Root 396/8", 396, 8);
  const solfeggioCrown = preset(workspaceId, 0x76, "Solfeggio Crown 963/8", 963, 8);
  const solfeggioLiver = preset(workspaceId, 0x77, "Solfeggio Liver 528/3.84", 528, 3.84);
  const solfeggioKidneys = preset(workspaceId, 0x78, "Solfeggio Kidneys 396/4.11", 396, 4.11);
  const solfeggioProtection = preset(workspaceId, 0x79, "Solfeggio Protection 963/8", 963, 8);
  const notesThirdEye = preset(workspaceId, 0x80, "432 Third-Eye 426.7/8", 426.7, 8);
  const notesThroat = preset(workspaceId, 0x81, "432 Throat 384/8", 384, 8);
  const notesHeart = preset(workspaceId, 0x82, "432 Heart 341.3/8", 341.3, 8);
  const notesSolar = preset(workspaceId, 0x83, "432 Solar Plexus 320/8", 320, 8);
  const notesHara = preset(workspaceId, 0x84, "432 Hara 288/8", 288, 8);
  const notesRoot = preset(workspaceId, 0x85, "432 Root 256/8", 256, 8);
  const notesCrown = preset(workspaceId, 0x86, "432 Crown 480/8", 480, 8);
  const notesLiver = preset(workspaceId, 0x87, "432 Liver 320/3.84", 320, 3.84);
  const notesKidneys = preset(workspaceId, 0x88, "432 Kidneys 256/4.11", 256, 4.11);
  const notesProtection = preset(workspaceId, 0x89, "432 Protection 480/8", 480, 8);

  const thirdEye = focus(
    workspaceId,
    0x20,
    "Third-Eye Chakra",
    CHAKRA_TYPE_ID,
    "Between the eyebrows",
    CHAKRA_DURATION_MS,
    solfeggioThirdEye.id,
  );
  const throat = focus(
    workspaceId,
    0x21,
    "Throat Chakra",
    CHAKRA_TYPE_ID,
    "Throat",
    CHAKRA_DURATION_MS,
    solfeggioThroat.id,
  );
  const heart = focus(
    workspaceId,
    0x22,
    "Heart Chakra",
    CHAKRA_TYPE_ID,
    "Center of the chest",
    CHAKRA_DURATION_MS,
    solfeggioHeart.id,
  );
  const solar = focus(
    workspaceId,
    0x23,
    "Solar Plexus",
    CHAKRA_TYPE_ID,
    "Upper abdomen",
    CHAKRA_DURATION_MS,
    solfeggioSolar.id,
  );
  const hara = focus(
    workspaceId,
    0x24,
    "Hara Chakra",
    CHAKRA_TYPE_ID,
    "Below the navel",
    CHAKRA_DURATION_MS,
    solfeggioHara.id,
  );
  const root = focus(
    workspaceId,
    0x25,
    "Root Chakra",
    CHAKRA_TYPE_ID,
    "Base of spine",
    CHAKRA_DURATION_MS,
    solfeggioRoot.id,
  );
  const crown = focus(
    workspaceId,
    0x26,
    "Crown Chakra",
    CHAKRA_TYPE_ID,
    "Top of the head",
    CHAKRA_DURATION_MS,
    solfeggioCrown.id,
  );
  const liver = focus(
    workspaceId,
    0x27,
    "Liver",
    POINT_TYPE_ID,
    "Right upper abdomen",
    ORGAN_DURATION_MS,
    solfeggioLiver.id,
  );
  const kidneys = focus(
    workspaceId,
    0x28,
    "Kidneys",
    POINT_TYPE_ID,
    "Lower back",
    ORGAN_DURATION_MS,
    solfeggioKidneys.id,
  );
  const protection = focus(
    workspaceId,
    0x29,
    "Protection",
    PROTECTION_TYPE_ID,
    "Aura",
    PROTECTION_DURATION_MS,
    solfeggioProtection.id,
  );
  /**
   * Thanks Giving: one silent affirmations stage, and the sentences it reads come
   * from their own table (§12.10).
   *
   * It names **no preset and no location**. A sound it never plays would be a
   * promise the stage does not keep — binaural is off for affirmations by
   * construction (`binauralForKind`) — and it is not practised at a place on the
   * body the way a chakra or a point is. No affirmations are seeded either: the
   * owner gave no text, and a sentence the reader did not write is not one they
   * should be asked to repeat.
   */
  const thanksGiving = focus(
    workspaceId,
    0x2a,
    "Thanks Giving",
    THANKS_GIVING_TYPE_ID,
    "",
    THANKS_GIVING_DURATION_MS,
    null,
  );

  const rama = symbol(
    workspaceId,
    0x30,
    "Rama",
    "helps in grounding and balance, focus on daily tasks, cleansing from negative energies. Removes sadness and depression. Helps in manifestations and finances",
    "Main attribute is to help in grounding and balance, practising this symbol helps in eliminating any energy bloackages and leads to better energy flow through your body. Also exeptionally helpful in cleansing and purifying house/car/office/cyrstals from dark energies and negavtive intentions. Opens the energetic road and facilitates as easy path to wherever you would like to go. enhances focus, eliminates sadness and depression.",
  );
  const zonar = symbol(
    workspaceId,
    0x31,
    "Zonar",
    "deep healing, dissolves negative patterns, protects you from trauma",
    "This mean infinite love and evolution. Zonar connects you to your past lives and has a deep healing level, reaching cellular and DNA layers. Dissolves negative patterns, Relationships war distance healing detana use this symbol to heal karmic issues that might interfere with that relationship. 'Cho ku reh' sobat use karu shakto hyala protection sathi",
  );
  const halu = symbol(
    workspaceId,
    0x32,
    "Halu",
    "Zonar +++ Protects against any kind of mental, physical aggression and/or manipulations. Helps recognize your past trauma, cleanse interior spaces, increase self-trust and to become self-aware. Deeper past-life healing",
    "Stronger version of Zonar. Mainly for psychic and global protection. Protects against any kind of mental, physical aggression and/or manipulations. Helps recognize your past trauma and heal it in your optimum rhythm. You can use this symbol to cleanse interior spaces, increase self-trust and to become self-aware. it helps in harmonizing ourselves with flaws and imperfections through learning and teaches us how to analyze and change things that aren't useful to our spiritual evolutions.",
  );
  const harth = symbol(
    workspaceId,
    0x33,
    "Harth",
    "Eliminates fear, mental and emotional blockages towards self, brings in love and compassion, diminishes cardiac issues. Imporves stability (balance), relationships, openness to giving and receiving,",
    "This symbol represents pure love and light. Opens gateways to the highest and purest forms of energy and vibrations. Helps to emilinate emotional blockages of love towards outselves and others. Diminishes cardiac issues, Drawing Harth will bring the energy of love and compassion to any specific area",
  );
  const gnosa = symbol(
    workspaceId,
    0x34,
    "Gnosa",
    "Develops intuition, focus, memory, self-awareness, self-acceptance, spiritual knowledge, wisdom, peace, creativity, and forgiveness, concentration and balance",
    "Means knowledge, develops intuition and frees the energetic path of learning and understanding, amplifies your ability to focus in studying and memorizing. Enahnces mental capacity and creative abilities. Also helps in connecting with your higher-self and unveil the absolute Divine truth. This symbol can bring in your true potential for spiritual knowledge, wisdom, compassion, love peace, awareness, and forgiveness, in a harmonious and non-narcissitic way.",
  );
  const iava = symbol(
    workspaceId,
    0x35,
    "Iava",
    "Phases out the veil of illusions, protects us from manipulations, superstitions and negative social patterns. Amplifies inner strength. Controls heals natural calamity",
    "Iava has the ability to eliminate the false self-generated conditionings and open the channel to reality. It phases out the veil of illusions. Earth, fire, wind, water, and spirit are represented in harmony through this beautiful Karuna Reiki symbol. It indicates how everything is a whole. Also acts as a protection against manipulations and negactively induced thoughts. Use this symbol to develop a resistance against social patterns or superstitions by protecting your rational side. Also helps us regain our inner strength and the self-trust that lies within us.",
  );
  const kriya = symbol(
    workspaceId,
    0x36,
    "Kriya",
    "Helps in manifesting!! Office politics/dynamics, finances",
    "Helps in manifesting!! turns ideas into actions; removes subconcious struggle and amplifies manifestations, helps in clarity and focus required for manifesting ambitious things, if paired with 'houn sha ze sho nen' helps to heal the entire planet",
  );
  const shanti = symbol(
    workspaceId,
    0x37,
    "Shanti",
    "Brings in peace and harmony and relieaves us from the fear, nightmares and trauma of the past.",
    "this is a high vibrational symbol that brings in peace and harmony, also helps healing the past. Use shanti to send peace to the traumatic past situations, fears and nightmares and free yourself from those attachments, also can be used for manifesting harmonious and peaceful future.",
  );

  const protectionText =
    "I am wholly and completely protected physically, emotionally, mentally and spiritually from lower and negative energies, from manipulation and negative influence, from thoughts, words, deeds, consequences and actions that create pain and suffering.";

  const pairs: Array<{ point: Meditation; glyph: Symbol; texts: string[] }> = [
    {
      point: solar,
      glyph: rama,
      texts: [
        "I intend to value, appreciate and respect myself to the highest standard",
        "I am always connected to the ground, stable and balanced",
        "Any sadness or depression in my life has been completely removed whole and complete",
        "All of my positive thoughts and intentions have been manifested whole and complete",
        "I always make correct investments early on and reap the benefits of their growths every time",
      ],
    },
    {
      point: hara,
      glyph: rama,
      texts: [
        "I am completely grounded, stable and aligned with the reality",
        "All the positive thoughts and intentions have been manifested whole and complete",
        "Sadness and depression has been completely eradicated from my life",
      ],
    },
    {
      point: root,
      glyph: rama,
      texts: [
        "I am completely grounded, stable, balanced and aligned to the highest divine truth",
        "I have mastered unbreakable discipline and concentration for consistently achieving my daily goals",
        "All the spaces around me have been completely cleansed of all the negative energy",
        "Sadness and depression has been completely removed from my life",
        "Success, prosparity, happiness and abundance come to me effortlessly, easily, and naturally",
      ],
    },
    { point: protection, glyph: zonar, texts: [protectionText] },
    {
      point: heart,
      glyph: halu,
      texts: [
        "I have been completely primed for healing, receiving and giving.",
        "All the repeating patterns and karma from my past lives has now been identified and healed, whole and complete.",
      ],
    },
    {
      point: root,
      glyph: halu,
      texts: [
        "I am completely protected against all the mental, physical agression and manipulation.",
        "My past traumas have been identified and healed whole and complete",
        "I trust myself and have become completely self-aware",
        "I always radiate beauty, grace and elegance in every space I enter",
      ],
    },
    {
      point: thirdEye,
      glyph: harth,
      texts: [
        "All of my fear and emotional blockages towards myself have been healed whole and complete",
        "Love, compassion have been filled into my third-eye chakra",
        "My relationships have improved and stabilized, I have a deep connection with everyone I meet",
        "I am completely open to healing, giving and receiving",
      ],
    },
    {
      point: throat,
      glyph: harth,
      texts: [
        "I have completely learnt from my past mistakes and let go of all the shame that comes from them",
        "I participate and thrive in every discussion that is beneficial for my growth.",
      ],
    },
    {
      point: heart,
      glyph: harth,
      texts: [
        "All the pain, sorrow and anguish in my heart has been healed whole and complete",
        "I am receptive, stable, and balanced",
        "All my fears have been healed whole and complete.",
      ],
    },
    {
      point: thirdEye,
      glyph: gnosa,
      texts: [
        "My Third-Eye chakra has been opened whole and complete as Divine Will wills so, so be it.",
        "My wisdom, concentration, memory and balance have improved whole and complete",
      ],
    },
    {
      point: solar,
      glyph: gnosa,
      texts: [
        "I have become more self-aware and intuitive with each passing day",
        "I am wholely protected against any malicious intent and possess the power to neutralize these threats completely",
        "I am always destined to win when challenged or threatened in any situation",
      ],
    },
    {
      point: heart,
      glyph: gnosa,
      texts: [
        "My heart chakra has been opened to accept the highest levels of wisdom, creativity, love and intuition",
        "All the generational wounds and trauma have now been healed, whole and complete",
      ],
    },
    {
      point: heart,
      glyph: iava,
      texts: [
        "My emotions are balanced and stabilized whole and complete",
        "I have been aligned to the objective reality and the will of this universe",
        "I have been completely protected from all the mental/physical agression, manipulation, envy and jealousy",
        "My inner strength has been amplified manifold",
        "All the people unintentionally/unwantedly stuck in a <calamity> have been released, protected and saved whole and complete",
      ],
    },
    {
      point: heart,
      glyph: kriya,
      texts: [
        "All my positive thoughts and intentions have been manifested whole and complete",
        "I have always been favored in all situations. All the office-politics always works to my advantage",
        "I have been blessed with immense financial wealth and abundance",
        "Prosparity, abundance, happiness and luck flows towards my intentions whole and complete",
      ],
    },
    {
      point: hara,
      glyph: kriya,
      texts: [
        "I always attract the highest level of admiration, love, respect and loyalty from all of my coworkers and friends",
        "I am completely protected from all the incompetance around me and succeed despite of it",
        "Mi kelelya pratyek kamacha mala pure-poor credit aani recognizition milalela aahe",
      ],
    },
    {
      point: root,
      glyph: kriya,
      texts: [
        "I have reprogrammed my abundance mindset, drawing in unlimited blessings beyond my boldest vision.",
      ],
    },
    { point: liver, glyph: kriya, texts: [] },
    {
      point: kidneys,
      glyph: kriya,
      texts: [
        "All the toxicity on emotional, spiritual and mental levels has been healed whole and complete",
        "All the Shock and fear has been healed whole and complete",
      ],
    },
    {
      point: liver,
      glyph: rama,
      texts: ["All the Shock and fear has been healed whole and complete"],
    },
    { point: kidneys, glyph: rama, texts: [] },
    {
      point: thirdEye,
      glyph: shanti,
      texts: ["I have received all the essential, necessary details about <> with complete clarity."],
    },
    {
      point: throat,
      glyph: shanti,
      texts: [
        "My fears and worries have been healed whole and complete.",
        "I always communicate in a stable and positive manner whenever I take a stand for myself, lose my temper or find myself in an uneasy situation",
      ],
    },
    {
      point: heart,
      glyph: shanti,
      texts: [
        "I always communicate in a stable and positive manner whenever I take a stand for myself, lose my temper or find myself in an uneasy situation",
        "All the fears, nightmares, past traumas and pain in my heart chakra have been completely let go from my life",
      ],
    },
    {
      point: solar,
      glyph: shanti,
      texts: [
        "Peace aani Harmony majhya life madhe sadaiva naandte",
        "I have been completely relieved whole and complete from all the fears, nightmares and traumas of the past",
      ],
    },
    {
      point: hara,
      glyph: shanti,
      texts: [
        "I have become self-aware and intuitive with each passing day",
        "Mi poorna pane protected aahe instigating situations aani lokan pasun, aani Universe always takes care of them the way they deserve.",
      ],
    },
    {
      point: root,
      glyph: shanti,
      texts: [
        "My marriage with <> has been written at a perfect divine timing, surrounded by joy, grace, happiness and blessings of our families, relatives, benevelent masters, arch angels, great ancestors and the master of this divine universe.",
      ],
    },
    {
      point: liver,
      glyph: halu,
      texts: [
        "My addictions and deep rooted anger have been healed whole and complete.",
        "Accumulation of fat over my liver has been cleared and cleansed whole and complete.",
      ],
    },
    { point: kidneys, glyph: halu, texts: [] },
    {
      point: liver,
      glyph: iava,
      texts: [
        "My addictions and deep-rooted anger have been healed whole and complete",
        "All the accumulation of fat in my liver has been cleared & cleansed whole and complete",
      ],
    },
    { point: kidneys, glyph: iava, texts: [] },
    {
      point: liver,
      glyph: shanti,
      texts: [
        "My addictions and deep-rooted anger have been healed whole and complete",
        "All the accumulation of fat in my liver has been cleared & cleansed whole and complete",
      ],
    },
    {
      point: kidneys,
      glyph: shanti,
      texts: [
        "All the toxicity on emotional, spiritual and mental levels has been healed whole and complete",
        "All the Shock and fear has been healed whole and complete",
      ],
    },
    { point: protection, glyph: rama, texts: [protectionText] },
    { point: crown, glyph: kriya, texts: [] },
    {
      point: thirdEye,
      glyph: kriya,
      texts: [
        'My thought and intent of "becoming wealthy, being financially independent and retiring early (FIRE) and having a passive stream of income" has been manifested permanently and steadfastly',
        "SYNC-SYNC-SYNC",
      ],
    },
  ];

  const entries: Entry[] = [];
  const intentions: Intention[] = [];
  // The order the catalogue reads in, in one place each. `Crown` is the seventh
  // chakra and the owner's list stops at Root, so it follows the six rather than
  // displacing one of them; the points and the custom row come after, and `Rama`
  // follows the named symbols for the same reason. `catalog-order.ts` is the same
  // order written for the callers that have to *recognise* it, and
  // `tests/unit/db/catalog-order.test.ts` fails if the two drift apart.
  const meditationRows = [
    thirdEye,
    throat,
    heart,
    solar,
    hara,
    root,
    crown,
    liver,
    kidneys,
    protection,
    thanksGiving,
    // The thirteen body points the owner listed (round 21, and round 22's split of two of
    // them), after the two the seed already had: those two rows are already on a reader's
    // device and their place is stored, so a seeded row that moved would be a change nobody
    // asked for. `pointsInCatalogueOrder()` is `FOCUS_ORDER`'s order — where the rows read,
    // which is not the order they sit in that file: a slot is half of a binding's id.
    ...pointsInCatalogueOrder().map((point) => seededPointRow(workspaceId, point)),
  ];
  /**
   * The points a points circuit walks: every row of the Points type, in the order this
   * catalogue lists them. That is `meditationRows`'s own order, which is the `sortOrder`
   * every reader's copy of the catalogue is numbered by.
   */
  const pointsForCircuit = meditationRows.filter((row) => row.typeId === POINT_TYPE_ID);
  const symbolRows = [
    harth,
    gnosa,
    halu,
    iava,
    shanti,
    kriya,
    zonar,
    // The four rows the owner added (§2.5) sit in the catalogue's own order, which
    // is the one `SYMBOL_ORDER` holds and the one the v24 repair places them in —
    // after `Zonar` and before `Rama`. Nothing is bound to them yet: they are
    // symbols to associate with a meditation later.
    ...SEEDED_REIKI_SYMBOLS.map((row) => addedSymbol(workspaceId, row)),
    rama,
  ];
  // Intentions are the one seeded row that used to be minted with `createId()`,
  // which made two devices seeding this catalog disagree about intention ids and
  // would duplicate every intention under id-merge sync (architectural review
  // the review's seeded-id finding, 2026-09-15). They are numbered from 0x100, above the focus/symbol/preset blocks; the
  // entries they belong to sit at 0x300, above the plan blocks at 0x200, so the
  // ranges stay readable and collide with nothing.
  let nextIntentionId = 0x100;
  let nextEntryId = 0x300;
  /**
   * The rows read chakra by chakra, and the symbols inside a chakra in the order
   * above.
   *
   * Walking `pairs` as written got both halves wrong, which is what the owner saw
   * — "I want the data grouped by chakra, right now it is arranged according to
   * symbol": that array is written **symbol by symbol**, so the rows came out
   * grouped by symbol, and `sortOrder` restarted at 0 for each chakra, so the
   * groups then interleaved by place instead of following one another.
   */
  let nextEntryOrder = 0;
  for (const focus of meditationRows) {
    const rows = pairs
      .filter((pair) => pair.point.id === focus.id)
      .sort((a, b) => symbolRows.indexOf(a.glyph) - symbolRows.indexOf(b.glyph));
    for (const row of rows) {
      const sortOrder = nextEntryOrder;
      nextEntryOrder += 1;
      // A pair is an entry now, and the lines written about it belong to that row:
      // the association and its intentions are two halves of the same thing.
      const entry: Entry = {
        id: nid(nextEntryId++),
        workspaceId,
        meditationId: row.point.id,
        symbolId: row.glyph.id,
        sortOrder,
        archivedAt: null,
        revision: 0,
        updatedAt: 0,
      };
      entries.push(entry);
      row.texts.forEach((text, index) => {
        intentions.push({
          id: nid(nextIntentionId++),
          workspaceId,
          entryId: entry.id,
          sortOrder: index,
          text,
          archivedAt: null,
          revision: 0,
          updatedAt: 0,
        });
      });
    }
  }

  // The owner's round 21 additions, walked in the **same** order as the pairs above so a
  // meditation's rows always read together: a body point's own row — the symbol-less one its
  // intentions stage reads, and the one a sheet draws "on its own" — before its symbols, and
  // then the four reiki symbols bound to every chakra and point. Appended after the pairs
  // rather than woven in, because the order of the walk above is also the order entry ids are
  // handed out in, and a row inserted in the middle would move every id after it.
  for (const row of meditationRows) {
    const point = SEEDED_POINTS.find((seeded) => seededPointId(seeded.slot) === row.id);
    if (point) {
      const content = seededPointContent(workspaceId, [point], nextEntryOrder);
      entries.push(...content.entries);
      intentions.push(...content.intentions);
      nextEntryOrder += content.entries.length;
    }
    const slot = seededMeditationSlotFor(row);
    if (slot === null) continue;
    entries.push(
      ...seededBindingsFor({
        workspaceId,
        meditationId: row.id,
        meditationSlot: slot,
        firstSortOrder: nextEntryOrder,
      }),
    );
    nextEntryOrder += BOUND_SYMBOL_SLOTS.length;
  }

  const blocks: PlanBlock[] = [];
  const pushMeditation = (point: Meditation) => {
    blocks.push(meditationBlock(nid(0x200 + blocks.length), blocks.length, point));
  };  // **No cool-off.** The owner's round 15 deleted the kind, so nothing sits between
  // the meditations; each one ends with its own last stage.
  //
  // §12.13: the seeded plan is Thanks Giving → the chakras in order → Thanks
  // Giving. The two Thanks Giving blocks are one row run twice, at the open and the
  // close of the circuit, and they are two blocks because a block is a *place* in a
  // plan: the second one can be given its own length later without moving the first.
  //
  // **Crown is not in it** since the owner's round 20 — *"Remove crown chakra from the
  // seeded meditation plan, it is not required"* — so the circuit walks six chakras.
  // The meditation itself stays in the library: the plan is what the owner asked to
  // change, not the catalogue.
  pushMeditation(thanksGiving);
  pushMeditation(thirdEye);
  pushMeditation(throat);
  pushMeditation(heart);
  pushMeditation(solar);
  pushMeditation(hara);
  pushMeditation(root);
  pushMeditation(thanksGiving);

  const plan: Plan = {
    id: DEFAULT_PLAN_ID,
    workspaceId,
    name: DEFAULT_PLAN_NAME,
    cycleCount: 1,
    cycleUntilStopped: false,
    autoAdvance: true,
    alarmEnabled: DEFAULT_ALARM_ENABLED,
    binauralEnabled: true,
    revision: 0,
    display: DEFAULT_PLAN_DISPLAY,
    blocks,
  };

  // The two extra columns the reader starts with, on the chakra table: one free
  // text and one `select`, so the option machinery has something in it the first
  // time the Database is opened. The seed describes the column, not what goes in
  // it — what a chakra governs is the reader's own note to keep.
  const governsColumn: FieldDef = {
    id: nid(0x0a0),
    workspaceId,
    scope: "meditation",
    typeId: CHAKRA_TYPE_ID,
    cellType: "longText",
    refKind: null,
    key: "governs",
    label: "Governs",
    description: "What this chakra or point is about.",
    sortOrder: 0,
    archivedAt: null,
    revision: 0,
    updatedAt: 0,
  };
  const elementColumn: FieldDef = {
    id: nid(0x0a1),
    workspaceId,
    scope: "meditation",
    typeId: CHAKRA_TYPE_ID,
    cellType: "select",
    refKind: null,
    key: "element",
    label: "Element",
    description: "The classical element this chakra is paired with.",
    sortOrder: 1,
    archivedAt: null,
    revision: 0,
    updatedAt: 0,
  };
  const elementOptions: FieldOption[] = ["Earth", "Water", "Fire", "Air", "Ether"].map(
    (label, index) => ({
      id: nid(0x0b0 + index),
      workspaceId,
      fieldDefId: elementColumn.id,
      label,
      sortOrder: index,
      revision: 0,
      updatedAt: 0,
    }),
  );

  /**
   * The presets, numbered in the order they read.
   *
   * Named here rather than written inline in the returned object because the points circuit
   * names one of them per group (round 25), and may only name a tone this device really holds.
   */
  const presetRows: BinauralPreset[] = [
    solfeggioThirdEye,
    solfeggioThroat,
    solfeggioHeart,
    solfeggioSolar,
    solfeggioHara,
    solfeggioRoot,
    solfeggioCrown,
    solfeggioLiver,
    solfeggioKidneys,
    solfeggioProtection,
    notesThirdEye,
    notesThroat,
    notesHeart,
    notesSolar,
    notesHara,
    notesRoot,
    notesCrown,
    notesLiver,
    notesKidneys,
    notesProtection,
  ].map((row, index) => ({ ...row, sortOrder: index }));

  return {
    meditationTypes,
    // Order is a property of the row here, so the array's own order is the order
    // the reader sees: Third-Eye first, a chakra's own pairs grouped together, and
    // the two types that are not practised one place at a time after them —
    // Protection, then Thanks Giving, which is where §12's type order puts them.
    meditations: meditationRows.map((row, index) => ({ ...row, sortOrder: index })),
    symbols: symbolRows.map((row, index) => ({
      ...row,
      sortOrder: index,
    })),
    entries,
    intentions,
    fieldDefs: [governsColumn, elementColumn],
    fieldOptions: elementOptions,
    presets: presetRows,
    // The second plan: every point, in the order this catalogue reads them, clubbed into the
    // owner's groups by `seeded-plans.ts`. It is built from the rows above rather than from the
    // slot lists, so it names what this device actually holds — presets included.
    plans: [
      plan,
      pointsCircuit(
        workspaceId,
        pointsForCircuit,
        presetRows.map((row) => row.id),
      ),
    ],
  };
}
