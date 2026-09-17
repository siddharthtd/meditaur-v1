import {
  classicBinauralPair,
  defaultEarEq,
  type BinauralPreset,
  type FocusKind,
  type FocusPoint,
  type FocusSymbolBinding,
  type Intention,
  type Plan,
  type PlanBlock,
  type Symbol,
  type TableView,
} from "@meditaur/domain";

export const DEFAULT_PLAN_NAME = "Circuit session";
export const CHAKRA_DURATION_MS = 420_000;
export const PROTECTION_DURATION_MS = 671_000;
export const ORGAN_DURATION_MS = 300_000;
export const COOLOFF_DURATION_MS = 190_000;
export const DEFAULT_PLAN_ID = "01900000-0000-7000-8000-000000000040";
export const DEFAULT_VIEW_ID = "01900000-0000-7000-8000-000000000050";

const GAIN = 0.45;
const FADE_MS = 40;

function nid(n: number): string {
  return `01900000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
}

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
  kind: FocusKind,
  locationText: string,
  durationMs: number,
  presetId: string,
): FocusPoint {
  return {
    id: nid(id),
    workspaceId,
    name,
    kind,
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
): Symbol {
  return {
    id: nid(id),
    workspaceId,
    name,
    description,
    usage,
    imageAssetId: null,
    revision: 0,
    updatedAt: 0,
  };
}

function focusBlock(id: string, sortOrder: number, point: FocusPoint, viewId: string): PlanBlock {
  return {
    id,
    sortOrder,
    type: "focus",
    durationMs: point.defaultDurationMs,
    focusPointId: point.id,
    symbolId: null,
    symbolScope: "all",
    binauralPresetId: point.defaultBinauralPresetId,
    tableViewId: viewId,
    ambientAssetId: null,
    alarmAssetId: null,
  };
}

function cooloffBlock(id: string, sortOrder: number): PlanBlock {
  return {
    id,
    sortOrder,
    type: "cooloff",
    durationMs: COOLOFF_DURATION_MS,
    focusPointId: null,
    symbolId: null,
    symbolScope: "rotate",
    binauralPresetId: null,
    tableViewId: null,
    ambientAssetId: null,
    alarmAssetId: null,
  };
}

export type DefaultWorkspace = {
  focusPoints: FocusPoint[];
  symbols: Symbol[];
  bindings: FocusSymbolBinding[];
  intentions: Intention[];
  presets: BinauralPreset[];
  tableViews: TableView[];
  plan: Plan;
};

export function buildDefaultWorkspace(workspaceId: string): DefaultWorkspace {
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
    "chakra",
    "Between the eyebrows",
    CHAKRA_DURATION_MS,
    solfeggioThirdEye.id,
  );
  const throat = focus(
    workspaceId,
    0x21,
    "Throat Chakra",
    "chakra",
    "Throat",
    CHAKRA_DURATION_MS,
    solfeggioThroat.id,
  );
  const heart = focus(
    workspaceId,
    0x22,
    "Heart Chakra",
    "chakra",
    "Center of the chest",
    CHAKRA_DURATION_MS,
    solfeggioHeart.id,
  );
  const solar = focus(
    workspaceId,
    0x23,
    "Solar Plexus",
    "chakra",
    "Upper abdomen",
    CHAKRA_DURATION_MS,
    solfeggioSolar.id,
  );
  const hara = focus(
    workspaceId,
    0x24,
    "Hara Chakra",
    "chakra",
    "Below the navel",
    CHAKRA_DURATION_MS,
    solfeggioHara.id,
  );
  const root = focus(
    workspaceId,
    0x25,
    "Root Chakra",
    "chakra",
    "Base of spine",
    CHAKRA_DURATION_MS,
    solfeggioRoot.id,
  );
  const crown = focus(
    workspaceId,
    0x26,
    "Crown Chakra",
    "chakra",
    "Top of the head",
    CHAKRA_DURATION_MS,
    solfeggioCrown.id,
  );
  const liver = focus(
    workspaceId,
    0x27,
    "Liver",
    "point",
    "Right upper abdomen",
    ORGAN_DURATION_MS,
    solfeggioLiver.id,
  );
  const kidneys = focus(
    workspaceId,
    0x28,
    "Kidneys",
    "point",
    "Lower back",
    ORGAN_DURATION_MS,
    solfeggioKidneys.id,
  );
  const protection = focus(
    workspaceId,
    0x29,
    "Protection",
    "custom",
    "Aura",
    PROTECTION_DURATION_MS,
    solfeggioProtection.id,
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

  const pairs: Array<{ point: FocusPoint; glyph: Symbol; texts: string[] }> = [
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

  const bindings: FocusSymbolBinding[] = [];
  const intentions: Intention[] = [];
  const nextOrder = new Map<string, number>();
  // Intentions are the one seeded row that used to be minted with `createId()`,
  // which made two devices seeding this catalog disagree about intention ids and
  // would duplicate every intention under id-merge sync (architectural review
  // M4). They are numbered from 0x100, above the focus/symbol/preset blocks and
  // below the plan blocks at 0x200, so the ranges stay readable and collide with
  // nothing.
  let nextIntentionId = 0x100;
  for (const row of pairs) {
    const sortOrder = nextOrder.get(row.point.id) ?? 0;
    nextOrder.set(row.point.id, sortOrder + 1);
    bindings.push({
      focusPointId: row.point.id,
      symbolId: row.glyph.id,
      sortOrder,
    });
    row.texts.forEach((text, index) => {
      intentions.push({
        id: nid(nextIntentionId++),
        workspaceId,
        focusPointId: row.point.id,
        symbolId: row.glyph.id,
        sortOrder: index,
        text,
        revision: 0,
        updatedAt: 0,
      });
    });
  }

  const blocks: PlanBlock[] = [];
  const pushFocus = (point: FocusPoint) => {
    blocks.push(focusBlock(nid(0x200 + blocks.length), blocks.length, point, DEFAULT_VIEW_ID));
  };
  const pushCooloff = () => {
    blocks.push(cooloffBlock(nid(0x200 + blocks.length), blocks.length));
  };
  pushFocus(thirdEye);
  pushCooloff();
  pushFocus(throat);
  pushCooloff();
  pushFocus(heart);
  pushCooloff();
  pushFocus(solar);
  pushCooloff();
  pushFocus(hara);
  pushCooloff();
  pushFocus(root);
  pushCooloff();
  pushFocus(protection);
  pushFocus(liver);
  pushCooloff();
  pushFocus(kidneys);
  pushCooloff();

  const plan: Plan = {
    id: DEFAULT_PLAN_ID,
    workspaceId,
    name: DEFAULT_PLAN_NAME,
    cycleCount: 1,
    cycleUntilStopped: false,
    autoAdvance: true,
    binauralEnabled: true,
    revision: 0,
    blocks,
  };

  return {
    focusPoints: [
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
    ],
    symbols: [rama, zonar, halu, harth, gnosa, iava, kriya, shanti],
    bindings,
    intentions,
    presets: [
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
    ],
    tableViews: [
      {
        id: DEFAULT_VIEW_ID,
        workspaceId,
        name: "Focus table",
        columnKeys: ["name", "description", "usage", "intentions"],
        symbolFilter: "focusPoint",
        revision: 0,
        updatedAt: 0,
      },
    ],
    plan,
  };
}
