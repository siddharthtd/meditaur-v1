export { createId } from "./ids.ts";
export { AppError, fail } from "./app-error.ts";
export {
  GRAPHIC_BANDS_HZ,
  EQ_Q,
  defaultEarEq,
  clampGainDb,
  setBandGain,
  linkEq,
  isFlatEq,
} from "./eq.ts";
export type { EqBand, EarEq } from "./eq.ts";
export {
  MAX_TONES_PER_EAR,
  MIN_HZ,
  MAX_HZ,
  DEFAULT_CARRIER_HZ,
  MIN_BEAT_HZ,
  MAX_BEAT_HZ,
  clampHz,
  clampGain,
  clampTone,
  busGain,
  addTone,
  removeTone,
  classicBinauralPair,
} from "./tones.ts";
export type { Tone } from "./tones.ts";
export type {
  WorkspaceType,
  MemberRole,
  FocusKind,
  BlockType,
  SymbolScope,
  SymbolFilter,
  FieldEntityType,
  MediaKind,
  Versioned,
  Workspace,
  WorkspaceMember,
  UserPreferences,
  SessionLog,
  FocusPoint,
  Symbol,
  FocusSymbolBinding,
  Intention,
  FieldDef,
  FieldValue,
  TableView,
  BinauralPreset,
  MediaAsset,
  PlanBlock,
  Plan,
  CompiledBinaural,
  CompiledTable,
  CompiledSymbolGroup,
  CompiledBlock,
  SessionSnapshot,
} from "./models.ts";
export {
  DEFAULT_FOCUS_DURATION_MS,
  durationFromParts,
  durationParts,
} from "./duration.ts";
export { systemClock, FakeClock } from "./clock.ts";
export type { Clock } from "./clock.ts";
export { RecordingAudioPort } from "./audio-port.ts";
export type { AudioPort } from "./audio-port.ts";
export type {
  AuthPort,
  AuthSession,
  BootstrapPort,
  CatalogRepository,
  PlanRepository,
  PreferencesRepository,
  PresetRepository,
  SessionContext,
  SessionLogRepository,
  SignUpOutcome,
  SnapshotRepository,
  BlobStore,
  StoredBlob,
  WorkspaceRepository,
} from "./ports.ts";
export {
  compilePlan,
  SNAPSHOT_SCHEMA_VERSION,
  SNAPSHOT_KEEP_PER_PLAN,
  SESSION_LOG_LIST_LIMIT,
  BUILTIN_COLUMNS,
  BUILTIN_COLUMN_KEYS,
} from "./compile-plan.ts";
export type { CompileLibrary, CompileOptions } from "./compile-plan.ts";
export { parsePlanBlocks, PLAN_BLOCK_ERRORS } from "./plan-blocks.ts";
export { SessionEngine, sessionIsLive } from "./session-engine.ts";
export type {
  SessionStatus,
  EngineEvent,
  PublicSessionState,
} from "./session-engine.ts";
