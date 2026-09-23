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
export {
  CHAKRA_TYPE_ID,
  POINT_TYPE_ID,
  PROTECTION_TYPE_ID,
  THANKS_GIVING_TYPE_ID,
  SEEDED_MEDITATION_TYPES,
} from "./meditation-types.ts";
export {
  DEFAULT_REIKI_SYSTEM,
  ENABLED_REIKI_SYSTEMS,
  REIKI_SYSTEMS,
  SEEDED_REIKI_SYMBOLS,
  isSymbolSystemEnabled,
} from "./reiki-systems.ts";
export {
  STAGE_KINDS,
  STAGE_KIND_LABELS,
  STAGE_KIND_DEFAULT_MS,
  INTENTION_STAGES,
  PROTECTION_STAGES,
  AFFIRMATION_STAGES,
  autoScrollForKind,
  binauralForKind,
  copyStages,
  defaultStage,
  stage,
  stageByKey,
  stagesDurationMs,
  blockStages,
  stagesForMeditation,
  withAutoScroll,
} from "./stages.ts";
export type {
  WorkspaceType,
  MemberRole,
  SymbolScope,
  CellType,
  FieldScope,
  RefKind,
  MediaKind,
  ReikiSystem,
  Versioned,
  Archived,
  Workspace,
  WorkspaceMember,
  UserPreferences,
  SessionLog,
  MeditationType,
  Meditation,
  StageKind,
  StageTemplate,
  PlanBlockStage,
  CompiledStage,
  Symbol,
  Entry,
  Intention,
  FieldDef,
  FieldOption,
  FieldValue,
  BinauralPreset,
  MediaAsset,
  PlanBlock,
  PlanDisplay,
  PlanDisplayArea,
  PlanDisplayColumn,
  Plan,
  CompiledBinaural,
  CompiledFact,
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
  MaintenancePort,
  AccountPort,
  EventPort,
  WorkspaceRepository,
} from "./ports.ts";
export type { AppEvent, AppEventType, ClientErrorPayload } from "./events.ts";
export {
  compilePlan,
  SNAPSHOT_SCHEMA_VERSION,
  SNAPSHOT_KEEP_PER_PLAN,
  SESSION_LOG_LIST_LIMIT,
} from "./compile-plan.ts";
export type { CompileLibrary, CompileOptions } from "./compile-plan.ts";
export {
  AREA_OF_SCOPE,
  BUILTIN_AREA_COLUMNS,
  DEFAULT_PLAN_DISPLAY,
  availableDisplayColumns,
  isAppDefaultDisplay,
  normalizePlanDisplay,
  setDisplayColumn,
} from "./plan-display.ts";
export {
  entryIsVisible,
  isLive,
  lineIsVisible,
  liveIds,
  livenessOf,
  visibleEntries,
  visibleEntryIds,
  visibleLines,
} from "./visibility.ts";
export type { ArchivedRow, Liveness } from "./visibility.ts";
export { parsePlanBlocks, PLAN_BLOCK_ERRORS, DEFAULT_ALARM_ENABLED } from "./plan-blocks.ts";
export { SessionEngine, sessionIsLive } from "./session-engine.ts";
export type {
  SessionStatus,
  EngineEvent,
  PublicSessionState,
} from "./session-engine.ts";
