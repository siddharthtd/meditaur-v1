import type { EarEq } from "./eq.ts";
import type { Tone } from "./tones.ts";

export type WorkspaceType = "personal" | "org";
export type MemberRole = "owner" | "editor" | "viewer";
export type FocusKind = "chakra" | "point" | "custom";
export type BlockType = "focus" | "cooloff";
export type SymbolScope = "rotate" | "all";
export type SymbolFilter = "block" | "focusPoint" | "all";
export type FieldEntityType = "symbol" | "focusPoint";
export type MediaKind = "ambient" | "alarm" | "image";

/**
 * What a row that sync will compare carries: a revision that moves on every
 * write, and when this device last wrote it. The catalogue rows are versioned
 * through this shape (M5), so a later push can compare per row instead of
 * replacing a table wholesale. `Plan` is versioned by `revision` alone, which
 * is what its atomic compare-and-swap uses.
 */
export type Versioned = {
  revision: number;
  updatedAt: number;
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
  masterVolume: number;
  alarmVolume: number;
  ttsEnabled: boolean;
  textSize: "md" | "lg" | "xl";
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

export type FocusPoint = Versioned & {
  id: string;
  workspaceId: string;
  name: string;
  kind: FocusKind;
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
};

export type Symbol = Versioned & {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  usage: string;
  imageAssetId: string | null;
};

export type FocusSymbolBinding = {
  focusPointId: string;
  symbolId: string;
  sortOrder: number;
};

export type Intention = Versioned & {
  id: string;
  workspaceId: string;
  focusPointId: string | null;
  symbolId: string | null;
  sortOrder: number;
  text: string;
};

export type FieldDef = Versioned & {
  id: string;
  workspaceId: string;
  entityType: FieldEntityType;
  /**
   * The field's stable identifier: what a table view's `columnKeys` name, and
   * what the stored value is keyed to.
   *
   * The reader does not type it (the owner's round 6: "the add custom field
   * should not be label and key, it should be heading and description"). It is
   * derived from `label` when the field is created and then never changes, so
   * renaming the heading cannot pull a column out from under a table view.
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

export type TableView = Versioned & {
  id: string;
  workspaceId: string;
  name: string;
  columnKeys: string[];
  symbolFilter: SymbolFilter;
};

export type BinauralPreset = Versioned & {
  id: string;
  workspaceId: string;
  name: string;
  leftTones: Tone[];
  rightTones: Tone[];
  fadeInMs: number;
  fadeOutMs: number;
  eqLeft: EarEq;
  eqRight: EarEq;
};

export type MediaAsset = Versioned & {
  id: string;
  workspaceId: string;
  kind: MediaKind;
  name: string;
  storagePath: string;
  durationMs: number;
};

export type PlanBlock = {
  id: string;
  sortOrder: number;
  type: BlockType;
  durationMs: number;
  focusPointId: string | null;
  symbolId: string | null;
  symbolScope: SymbolScope;
  binauralPresetId: string | null;
  tableViewId: string | null;
  ambientAssetId: string | null;
  alarmAssetId: string | null;
};

export type Plan = {
  id: string;
  workspaceId: string;
  name: string;
  cycleCount: number;
  cycleUntilStopped: boolean;
  autoAdvance: boolean;
  binauralEnabled: boolean;
  revision: number;
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

export type CompiledTable = {
  viewName: string;
  columns: { key: string; label: string }[];
  rows: string[][];
};

export type CompiledSymbolGroup = {
  name: string;
  description: string;
  usage: string;
  /** The symbol's picture, as a media-asset id the run screen resolves to a
   *  blob URL. Null when the symbol has none — never an empty string. */
  imageAssetId: string | null;
  intentions: string[];
};

export type CompiledBlock = {
  blockId: string;
  type: BlockType;
  durationMs: number;
  focusPointName: string | null;
  symbolName: string | null;
  intentions: string[];
  focusIntentions: string[];
  symbolGroups: CompiledSymbolGroup[];
  table: CompiledTable | null;
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
  stopBinauralOnAlarm: boolean;
  cycleCount: number;
  cycleUntilStopped: boolean;
  blocks: CompiledBlock[];
};
