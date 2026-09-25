import type { EarEq } from "./eq.ts";
import type { Tone } from "./tones.ts";

export type WorkspaceType = "personal" | "org";
export type MemberRole = "owner" | "editor" | "viewer";
export type SymbolScope = "rotate" | "all";
export type MediaKind = "ambient" | "alarm" | "image";

/**
 * The reiki system a symbol belongs to.
 *
 * Karuna Reiki is the one system the app shipped until the owner's round 16, and
 * Usui Reiki and the Reiki master symbol arrived with it. The three are **feature
 * flags**, and which of them a surface lists is `isSymbolSystemEnabled`'s answer
 * (`reiki-systems.ts`), never this field's: the field says what a symbol *is*.
 */
export type ReikiSystem = "karuna_reiki" | "usui_reiki" | "reiki_master";

/**
 * What a column holds, and therefore which control edits it.
 *
 * The stored value is always `FieldValue.text` — one column, whatever the type
 * — so the cell type is a fact about how to read that text, not about where it
 * lives. Two of them store something other than prose, and both store an **id**:
 * an `image` cell holds a media asset's id and a `reference` cell holds the id
 * of the record it points at, so renaming a chakra does not blank the columns
 * that point at it. A `select` cell holds the id of its `FieldOption`, for the
 * same reason: the option's label is what the reader renames.
 */
export type CellType =
  | "text"
  | "longText"
  | "number"
  | "duration"
  | "date"
  | "image"
  | "reference"
  | "select";

/** Which table of the Database a column belongs to. */
export type FieldScope = "entry" | "meditation" | "symbol" | "affirmation";

/** What a `reference` column points at. */
export type RefKind = "meditation" | "symbol" | "preset";

/**
 * What a row that sync will compare carries: a revision that moves on every
 * write, and when this device last wrote it. The catalogue rows are versioned
 * through this shape (the catalogue's revision), so a later push can compare per row instead of
 * replacing a table wholesale. `Plan` is versioned by `revision` alone, which
 * is what its atomic compare-and-swap uses.
 */
export type Versioned = {
  revision: number;
  updatedAt: number;
  /**
   * The delete mark (`P2 · 3`, the schema slice): absent or `null` means the row is
   * live, a timestamp means it was deleted here and that fact has to travel.
   *
   * A delete cannot be an absence. Sync compares two devices per row and never asks
   * the reader (DECISIONS.md §7), so a row that simply vanished from one device
   * would look *new* to the other and come back with the next pull — which is why a
   * delete travels as a row with a later revision and this mark on it.
   *
   * It is not `Archived`'s `archivedAt`, which sits beside it: archiving is the
   * reader's one undo and the Archive page draws those rows, while this is final and
   * invisible.
   *
   * Optional on purpose, and not because the value is unsure: the shape it is on is
   * spread into drafts that screens build for a row they have not stored, and a
   * weakly-typed domain field is how this repo keeps those compiling (the same
   * reasoning as `Symbol.reikiSystem`). Absent and `null` mean the same thing, and
   * the store writes `null` so nothing downstream has to tell them apart.
   */
  deletedAt?: number | null;
};

/**
 * A catalogue row that can step aside instead of being destroyed.
 *
 * Archiving is the reader's safety net and the only undo the product has (§14.2):
 * an archived row is hidden, and nothing that depends on it is touched, so
 * Restore brings back exactly what was there. `null` means live. The *visibility
 * rule* — an item is visible only if it and every record it references are live —
 * is derived from this field and never stored (see `visibility.ts`).
 */
export type Archived = Versioned & {
  archivedAt: number | null;
};

export type Workspace = {
  id: string;
  type: WorkspaceType;
  name: string;
};

export type WorkspaceMember = {
  workspaceId: string;
  userId: string;
  role: MemberRole;
};

export type UserPreferences = {
  userId: string;
  stopBinauralOnAlarm: boolean;
  autoAdvance: boolean;
  /**
   * Whether a new plan's blocks ring their alarm (§12.4, §12.21).
   *
   * The **default a new plan starts from**, like `autoAdvance` above: the plan
   * carries its own copy, and that copy is what a session obeys.
   */
  alarmEnabled: boolean;
  masterVolume: number;
  alarmVolume: number;
  ttsEnabled: boolean;
  textSize: "sm" | "md" | "lg" | "xl";
  /**
   * Which of the eight colour schemes this reader paints the app in (`P2 · 46`).
   *
   * A preference rather than a device setting, and stored as the **name** of a scheme
   * rather than as colours: the hexes are the app's, so a scheme can be tuned without
   * rewriting anybody's row, and the same reader on another device gets the same scheme.
   * `DEFAULT_THEME` is the app's own, which is what a row written before this field
   * existed reads as.
   */
  theme:
    | "warm"
    | "midnight"
    | "forest"
    | "copper"
    | "plum"
    | "paper"
    | "sea"
    | "sakura";
  lastPlanId: string | null;
  /**
   * Bumped on every write, like `Plan.revision`. A save carries the revision it
   * read, so two writers holding the same row cannot both land: the second is
   * refused instead of silently overwriting the first one's change.
   */
  revision: number;
  updatedAt: number;
};

export type SessionLog = {
  id: string;
  workspaceId: string;
  planId: string;
  completedAt: number;
  blockCount: number;
  totalDurationMs: number;
};

/**
 * What a stage *is*, which picks the view the run screen draws for it.
 *
 * The owner's round 15: a stage's `label` is free text a reader can rewrite, so
 * nothing in code may switch on it. The `kind` is the closed list, and it is the
 * only thing the screen is allowed to ask about a stage.
 */
export type StageKind = "intentions" | "symbols" | "focus" | "affirmations";

/**
 * One subsection of a meditation block, with its own timer.
 *
 * On a type this is the **template** a new block is built from; on a meditation it
 * is that meditation's own copy (the owner's §12.8: "every seeded chakra carries
 * its own copy"); on a plan block it is the template **materialised**, and the block
 * never reads its type at run time — editing a type cannot reshape a plan that
 * already exists, it only affects the blocks added afterwards.
 *
 * `key` is stable inside its owner and `label` is what the reader sees, so a stage
 * can be relabelled without moving. The three trailing fields are the defaults the
 * block materialises.
 */
export type PlanBlockStage = {
  key: string;
  label: string;
  kind: StageKind;
  durationMs: number;
  /** Binaural is per stage, and off for an intentions or affirmations stage. */
  binaural: boolean;
  /** The run screen's auto-scrolling intentions column (the owner's §12.19). */
  autoScroll: boolean;
};

/** A type's stage template, which is the shape a block's stage is materialised in. */
export type StageTemplate = PlanBlockStage;

/** A compiled stage: the block's own stage, taken verbatim into the snapshot. */
export type CompiledStage = PlanBlockStage;

/**
 * A kind of meditation: Chakra, Point, Protection, Thanks Giving, or one the
 * reader adds later.
 *
 * It is a **row** rather than a union in code (the owner's round 15) because the
 * ask was that *"more could be added later"* without a code change: a live type
 * gets its own tab in the library, its own table in the Database, its own pool of
 * columns and its own group in every plan picker — all generated from these rows,
 * with nothing to register.
 */
export type MeditationType = Archived & {
  id: string;
  workspaceId: string;
  /** The reader's word for it: `Chakra`, `Thanks Giving`. */
  name: string;
  /** Where the type sits in the library's tab strip and in every picker. */
  sortOrder: number;
  /**
   * The stages a block of this type runs, in order.
   *
   * This is the *template*: a block materialises a copy when it is made, and a
   * meditation may carry a copy of its own that wins over this one.
   */
  stages: StageTemplate[];
};

export type Meditation = Archived & {
  id: string;
  workspaceId: string;
  name: string;
  /** Which kind of meditation this is. Never null: a meditation is always typed. */
  typeId: string;
  locationText: string;
  defaultBinauralPresetId: string | null;
  defaultDurationMs: number;
  description: string | null;
  governs: string | null;
  colour: string | null;
  element: string | null;
  representationAssetId: string | null;
  representationDescription: string | null;
  binauralEnabled: boolean;
  /**
   * This meditation's own copy of its type's stage template, or `null` for "use
   * the type's".
   *
   * The owner's §12.8: a chakra with more intentions wants more time, so a chakra
   * may tune its own timers, and it does so without moving the type's template for
   * every other chakra.
   */
  stages: PlanBlockStage[] | null;
  /** Where this row sits in the Chakras table, and in every picker that lists it. */
  sortOrder: number;
};

export type Symbol = Archived & {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  usage: string;
  imageAssetId: string | null;
  /**
   * The system this symbol belongs to, or absent for a row the app places in
   * none.
   *
   * Absent is a real state and not a hole: the two surfaces that mint a symbol
   * (the library's `Add`, and `+` in the Database) name no system, and a row
   * written before the field existed has none either — `normalizeSymbol` reads
   * such a row as `DEFAULT_REIKI_SYSTEM`, which is what it was. So the app's own
   * seeding stamps a system and a reader's own row stays outside the flag, and
   * `isSymbolSystemEnabled(undefined)` is true for exactly that reason.
   */
  reikiSystem?: ReikiSystem;
  sortOrder: number;
};

/**
 * One row of the Entries table: a chakra, a symbol, or a chakra x symbol pair.
 *
 * The pair used to be two things — a `MeditationSymbolBinding` (chakra x symbol) and
 * a bare `Intention` for everything else — which meant "the intentions of this
 * pairing" had no row to hang on and "which symbols does this chakra have" was
 * a second table. One row is both: it *is* the association, and it holds the
 * lines written about it.
 *
 * A stored row has at least one reference — the schema and `saveEntry` both say
 * so. A row with neither is a draft the reader has not finished filling in, and
 * it is never stored: Save's orphan sweep archives a stored row that lost its
 * last reference, and drops an unfinished one that was never stored at all.
 */
export type Entry = Archived & {
  id: string;
  workspaceId: string;
  meditationId: string | null;
  symbolId: string | null;
  sortOrder: number;
};

/**
 * One sentence: an intention the reader reads in a session.
 *
 * The owner's round 16, §2.1: an affirmation and an intention are **one table**.
 * A sentence is written about a pair — a chakra or a point (or Protection, or
 * Thanks Giving) with a symbol, or the meditation alone — and `entryId` is that
 * pair's row. `null` is the orphan: a sentence that exists and is written about
 * nothing yet, which is what the Affirmations tab lists until something is
 * associated with it.
 *
 * Round 15 kept the affirmations in a table of their own (§12.10); this is what
 * replaced that. The merge cost nothing on disk because an orphan is exactly what a
 * sentence with no pair is, and the pair's own row already allowed a meditation, a
 * symbol, or both.
 */
export type Intention = Archived & {
  id: string;
  workspaceId: string;
  /** The pair this sentence is written about, or `null` for an orphan. */
  entryId: string | null;
  sortOrder: number;
  text: string;
};

export type FieldDef = Archived & {
  id: string;
  workspaceId: string;
  /** Which table this column was added to. */
  scope: FieldScope;
  /**
   * The type this column belongs to, or `null` for every type.
   *
   * The owner's round 15: a chakra has `Governs` and `Element`, a Thanks Giving
   * has neither, and a column that belongs to one type must not leak onto
   * another type's rows. `null` is the shared column — one every type shows.
   */
  typeId: string | null;
  /** How a cell in this column is edited, and how its text is read. */
  cellType: CellType;
  /** What a `reference` column points at; null for every other cell type. */
  refKind: RefKind | null;
  /**
   * The field's stable identifier: what a plan's display names, and what the
   * stored value is keyed to.
   *
   * The reader does not type it (the owner's round 6: "the add custom field
   * should not be label and key, it should be heading and description"). It is
   * derived from `label` when the field is created and then never changes, so
   * renaming the heading cannot pull a column out from under a display that
   * lists it.
   */
  key: string;
  /** The heading this field is shown under, in editors and in the open views. */
  label: string;
  /** What the field is for, in the reader's words. Optional to fill in. */
  description: string;
  sortOrder: number;
};

export type FieldValue = Versioned & {
  entityId: string;
  fieldDefId: string;
  text: string;
};

/**
 * One option of a `select` column.
 *
 * A `select` cell stores the option's id, so an option the reader renames keeps
 * every cell that chose it. Options are not archived: a cell that chose one is
 * the reason it cannot be removed (§4), and an option nothing chose is simply
 * deleted.
 */
export type FieldOption = Versioned & {
  id: string;
  workspaceId: string;
  fieldDefId: string;
  label: string;
  sortOrder: number;
};

export type BinauralPreset = Archived & {
  id: string;
  workspaceId: string;
  name: string;
  leftTones: Tone[];
  rightTones: Tone[];
  fadeInMs: number;
  fadeOutMs: number;
  eqLeft: EarEq;
  eqRight: EarEq;
  sortOrder: number;
};

export type MediaAsset = Versioned & {
  id: string;
  workspaceId: string;
  kind: MediaKind;
  name: string;
  storagePath: string;
  durationMs: number;
  /**
   * Where the row sits in the Audio files list.
   *
   * An upload goes after the last row, and the value is what lets a screen insert
   * it there instead of re-reading the catalogue (`P2 · 4`). It is the reader's
   * order, not a display detail of one screen: the same reasoning as
   * `BinauralPreset.sortOrder` beside it.
   */
  sortOrder: number;
};

/**
 * How a plan card thins the intentions it reads, or `null` for all of them.
 *
 * The owner's round 24 (`P2 · 45`): *"if we will have a plenty of intentions, we will
 * randomly choose the fixed number of intentions to use for this particular session …
 * without having the burden to choose the intentions, or go fast at the intention stage
 * in order to meditate on all the intentions."* A list the reader keeps adding to stops
 * being a list they can get through in one sitting, so a session draws a subset and the
 * next session draws a different one.
 *
 * **`null` means the block has never been asked**, which is why it is a value rather than
 * a default: every plan written before this reads as the whole list, and nothing is
 * copied into a block until the reader turns the master switch on. It is the
 * `alarmEnabled`/`display` shape, one level down from the plan.
 *
 * A count is a **ceiling, not a quota**: a count at or above the list keeps all of it,
 * `0` keeps none, and a list shorter than the count is never padded or duplicated.
 */
export type IntentionRandomiser = {
  /** The card's master switch. Off — or `null` above — means every line is read. */
  on: boolean;
  /**
   * The lines that belong to the meditation and to no symbol — the `(meditationId, null)`
   * pair, which for a point block is every point's own lines read as one list.
   */
  own: { on: boolean; count: number };
  /**
   * The lines read under a symbol: one count for **every** symbol of the block, applied
   * to that symbol's own lines pooled with the meditations' lines for it — the group the
   * session draws under that symbol's name.
   */
  symbols: { on: boolean; count: number };
};

export type PlanBlock = {
  id: string;
  sortOrder: number;
  /**
   * The meditations this block runs, in the reader's order. **Never empty**: the owner's
   * round 15 deleted cool-off, so every block is a meditation block and one that names
   * nothing has nothing to run (`compilePlan` refuses one).
   *
   * A **list** since round 22: a point block clubs several points into one pass — one set
   * of stages and timers, one intentions reading, and the symbols its points have in
   * common shown together — because that is how the owner practises the body's points. A
   * chakra block holds one, and every block written before this round is read as a list of
   * one (`parsePlanBlocks`), so nothing stored has to move.
   */
  meditationIds: string[];
  /**
   * The stages this block runs, materialised from its meditation's type (or from
   * the meditation's own copy) when the block was made.
   *
   * A block has no single `durationMs` any more: its length is the sum of these,
   * because the owner's round 15 replaced one timer per block with one timer per
   * stage. A block with no stages — one written before this round — is read as a
   * single stage carrying the length it stored (`parsePlanBlocks`).
   */
  stages: PlanBlockStage[];
  symbolId: string | null;
  symbolScope: SymbolScope;
  binauralPresetId: string | null;
  ambientAssetId: string | null;
  alarmAssetId: string | null;
  /**
   * Whether **this** meditation's end rings, or `null` for the plan's answer.
   *
   * The owner's round 17, item 13: *"Whatever is meditation specific — symbols,
   * ambient, alarm, binaural, stages of meditation etc, all should be updatable for
   * that particular meditation … by clicking on the card."* The alarm was the one
   * setting of those with nowhere per-meditation to live: §12.21 put the switch on
   * the plan, and the reader's ask is that a plan can open with a silent Thanks
   * Giving and a ringing chakra without a second plan.
   *
   * `null` is the honest default and not a missing value: it means *"whatever the
   * plan says"*, so a plan whose blocks have never been asked the question behaves
   * exactly as it did — `Plan.alarmEnabled` still decides, and nothing is copied
   * into a block until the reader says otherwise.
   */
  alarmEnabled: boolean | null;
  /**
   * What **this** meditation shows while it runs, or `null` for the plan's Display.
   *
   * The owner's round 17: the Display panel moved off the foot of the plan screen
   * and into the meditation it describes — *"The display menu at the bottom should be
   * per-meditation block as well"* — because a circuit holds an affirmations-only
   * Thanks Giving beside seven chakras, and which columns are worth showing is not
   * the same question for both. `null` means the plan's, on the same rule as
   * `alarmEnabled` above: a block is only given a display of its own once the reader
   * arranges one.
   */
  display: PlanDisplay | null;
  /**
   * How many of this meditation's intentions the session draws, or `null` for all of
   * them.
   *
   * The owner's round 24 (`P2 · 45`), and the one setting on this card that changes
   * nothing in the store: it decides what a **session** reads, so a block that carries it
   * still owns every line it ever did. `null` is the honest default for the same reason
   * `alarmEnabled`'s is — a plan written before the field existed reads every line, and
   * nothing is written into a block until the reader asks for it.
   */
  intentionRandomiser: IntentionRandomiser | null;
};

/**
 * Which side of the Database a display column belongs to. A column is a fact
 * about one of the three things a block is made of: the chakra it runs on, a
 * symbol in play, or the pair itself.
 */
export type PlanDisplayArea = "meditation" | "symbol" | "entry";

export type PlanDisplayColumn = {
  /** A builtin column's key (`name`, `location`, …) or a `FieldDef.key`. */
  key: string;
  area: PlanDisplayArea;
  shown: boolean;
  /** Stays in place while the rest of the session screen scrolls. */
  pinned: boolean;
};

/**
 * What the reader wants to see while meditating, held on the plan (§9).
 *
 * The Database holds no display settings of its own: a column is a fact about
 * the store, and which of those facts are useful *during a session* is a
 * property of the session. `columns` is a list rather than a set because the
 * reader orders it, and the order is the order the facts render in.
 */
export type PlanDisplay = {
  columns: PlanDisplayColumn[];
};

export type Plan = {
  id: string;
  workspaceId: string;
  name: string;
  cycleCount: number;
  cycleUntilStopped: boolean;
  autoAdvance: boolean;
  /**
   * Whether the alarm rings at the end of each block **that has not answered for
   * itself**.
   *
   * The plan's switch, beside `autoAdvance` (§12.21) — but since the owner's round
   * 17 it is a **default** as well as a switch: `PlanBlock.alarmEnabled` is the
   * meditation's own answer, `null` means "the plan's", and
   * `UserPreferences.alarmEnabled` is only the value a *new* plan is created with.
   * The run screen's latch writes the block on screen, which is what gives one
   * meditation an answer of its own.
   */
  alarmEnabled: boolean;
  binauralEnabled: boolean;
  revision: number;
  display: PlanDisplay;
  blocks: PlanBlock[];
};

export type CompiledBinaural = {
  leftTones: Tone[];
  rightTones: Tone[];
  fadeInMs: number;
  fadeOutMs: number;
  eqLeft: EarEq;
  eqRight: EarEq;
};

/**
 * One column's value, resolved for the screen that reads it.
 *
 * A fact is compiled rather than looked up live for the same reason the rest of
 * the snapshot is: a session has to keep saying what it said when it started,
 * even if the reader edits the store under it. Ids are resolved here — a
 * reference cell's id becomes the record's name, a select cell's id becomes the
 * option's label — because the snapshot is what a screen renders.
 */
export type CompiledFact = {
  key: string;
  label: string;
  value: string;
  /** The reader pinned this column, so it stays in place while the rest of the
   *  session screen scrolls: it renders in the box's sticky band with the
   *  name, and the columns that are not pinned render below that band. */
  pinned: boolean;
};

export type CompiledSymbolGroup = {
  name: string;
  description: string;
  usage: string;
  /** The symbol's picture, as a media-asset id the run screen resolves to a
   *  blob URL. Null when the symbol has none — never an empty string. */
  imageAssetId: string | null;
  /** The symbol columns the plan's display shows, in display order. */
  facts: CompiledFact[];
  /** The entry columns the plan's display shows — facts about the pair. */
  entryFacts: CompiledFact[];
  intentions: string[];
};

export type CompiledBlock = {
  blockId: string;
  /** The stages' lengths added up, computed once here. */
  durationMs: number;
  /** The block's stages, verbatim. The engine walks these. */
  stages: CompiledStage[];
  /**
   * The sentences this block's stage reads: the ones written about the block's own
   * meditation, in the reader's order.
   *
   * The owner's round 16, §2.1 and §4: a Thanks Giving stage reads Thanks Giving's
   * sentences and a Protection stage reads Protection's — including the ones on a
   * symbol-carrying row, which is where the seeded Protection sentence has always
   * lived. Round 15 read every affirmation in the workspace instead, which is why a
   * Protection stage showed nothing at all (item 0.1).
   */
  affirmations: string[];
  /**
   * The block's **lead** meditation, by name — its first point.
   *
   * The session screen's accent and its Media Session title read this, so a point block
   * still has one meditation it is "about"; the title spells out the rest from
   * `meditationNames` beside it.
   */
  meditationName: string | null;
  /**
   * Every meditation the block runs, by name, in the block's own order.
   *
   * A point block clubs several into one pass (the owner's round 22) and the session screen
   * heads itself with all of them. Stamped here for the same reason the type is: the
   * snapshot is what a running session reads, and a point's name is a row the reader can
   * rename.
   */
  meditationNames: string[];
  /**
   * The meditation's picture and its own colour, stamped like the name.
   *
   * A Focus stage draws the meditation's picture in its colour (the owner's round 20, item
   * 5), and neither is a row the session may look up later: the snapshot is what a running
   * session reads, exactly as it reads `meditationTypeName` beside them.
   */
  representationAssetId: string | null;
  colour: string | null;
  /**
   * The meditation's type, by name, at compile time.
   *
   * The session screen's meditation panel heads itself with the meditation over its
   * type — the same pair a plan card's handle shows (§6.1) — and the type is a row
   * the reader can rename, so the snapshot has to carry the word it read rather than
   * look it up later.
   */
  meditationTypeName: string | null;
  symbolName: string | null;
  intentions: string[];
  focusIntentions: string[];
  /**
   * Whether this block's own end rings, resolved from the block and the plan.
   *
   * Stamped at compile time like the rest of the snapshot, so a session keeps the
   * answer it started with. The plan's value is the fallback rather than the only
   * answer (the owner's round 17): `PlanBlock.alarmEnabled: null` means the plan
   * decides, and a block that says `false` is silent whatever the plan says.
   */
  alarmEnabled: boolean;
  /** The chakra columns the plan's display shows, in display order. */
  meditationFacts: CompiledFact[];
  symbolGroups: CompiledSymbolGroup[];
  binaural: CompiledBinaural | null;
  ambientAssetId: string | null;
  alarmAssetId: string | null;
  alarmDurationMs: number;
};

export type SessionSnapshot = {
  instanceId: string;
  planId: string;
  compiledAt: number;
  schemaVersion: number;
  autoAdvance: boolean;
  /**
   * The plan's answer, stamped at compile time.
   *
   * Each block carries its **own** resolved `alarmEnabled` (the block first, and
   * this behind it), so a session keeps both the per-meditation answers it started
   * with and the plan-level one they fall back to.
   */
  alarmEnabled: boolean;
  stopBinauralOnAlarm: boolean;
  cycleCount: number;
  cycleUntilStopped: boolean;
  blocks: CompiledBlock[];
};
