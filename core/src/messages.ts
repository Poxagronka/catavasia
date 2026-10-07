/**
 * AUTO-GENERATED FROM core/asyncapi.yaml. DO NOT EDIT MANUALLY.
 *
 * Run `npm run asyncapi:generate` to regenerate.
 *
 * Source of truth: the yaml at core/asyncapi.yaml.
 * Editors and clients in any language can consume the spec directly.
 */

export type ServerMessage =
  | ProviderCapabilities
  | AgentCreated
  | AgentClosed
  | AgentSelected
  | ExistingAgents
  | AgentStatus
  | AgentToolStart
  | AgentToolDone
  | AgentToolsClear
  | AgentToolPermission
  | AgentToolPermissionClear
  | SubagentToolStart
  | SubagentToolDone
  | SubagentClear
  | SubagentToolPermission
  | AgentTeamInfo
  | AgentTaskFinished
  | CatProfilesLoaded
  | CatProfileSaved
  | CatProfileRejected
  | CatHierarchy
  | CatTurnStarted
  | CatTurnFinished
  | CatMessage
  | FlowStateChanged
  | QueueChanged
  | CatCharacters
  | CatCeoSettings
  | ReviewStarted
  | ReviewFinished
  | ReviewFailed
  | PromptHistory
  | PromptDiff
  | PromptTidy
  | NarratorLine
  | NarratorSummary
  | NarratorSettings
  | AgentContextUsage
  | LayoutLoaded
  | ResetAllResult
  | FeedbackResult
  | PetCareLoaded
  | FurnitureAssetsLoaded
  | CharacterSpritesLoaded
  | PetSpritesLoaded
  | FloorTilesLoaded
  | WallTilesLoaded
  | CarpetTilesLoaded
  | SettingsLoaded
  | HooksStatus
  | HooksConsentRequest
  | ExternalAssetDirectoriesUpdated
  | AreaMappingsLoaded
  | WorkspaceFolders
  | AgentDiagnostics;

export type ClientMessage =
  | WebviewReady
  | LaunchAgent
  | FocusAgent
  | CloseAgent
  | SaveAgentSeats
  | SaveLayout
  | SavePetCare
  | SetSoundEnabled
  | SetLastSeenVersion
  | SetAlwaysShowLabels
  | SetGhostHeadlessAgents
  | SetHooksEnabled
  | HooksConsentResponse
  | SetHooksInfoShown
  | SetWatchAllSessions
  | ExportLayout
  | ResetLayoutToDefault
  | ResetAllToDefault
  | ImportLayout
  | OpenSessionsFolder
  | AddExternalAssetDirectory
  | RemoveExternalAssetDirectory
  | SaveAreaMappings
  | SetShowAreas
  | RequestDiagnostics
  | SaveCatProfile
  | DeleteCatProfile
  | SetCatParent
  | PromoteCatToBoss
  | SetTurnConcurrency
  | SetShowGuests
  | SetNarratorSettings
  | SetCatCeoSettings
  | GetPromptHistory
  | GetPromptDiff
  | RevertPromptEdit
  | RestorePromptVersion
  | RemovePromptItem
  | SavePromptItem
  | TidyPrompt
  | CheckEngines
  | SubmitFeedback;

export interface ProviderCapabilities {
  type: 'providerCapabilities';
  readingTools: string[];
  subagentToolNames: string[];
}

export interface AgentCreated {
  type: 'agentCreated';
  id: number;
  folderName?: string;
  isExternal?: boolean;
  palette?: number;
  hueShift?: number;
}

export interface AgentClosed {
  type: 'agentClosed';
  id: number;
}

export interface AgentSelected {
  type: 'agentSelected';
  id: number;
}

export interface ExistingAgents {
  type: 'existingAgents';
  agents: number[];
  agentMeta: Record<string, AgentSeatMeta>;
  folderNames: Record<string, string>;
  externalAgents: Record<string, boolean>;
}

export interface AgentSeatMeta {
  palette?: number;
  hueShift?: number;
  seatId?: string;
}

export interface AgentStatus {
  type: 'agentStatus';
  id: number;
  status: AgentActivityStatus;
  awaitingInput?: boolean;
}

export type AgentActivityStatus = 'active' | 'waiting';

export interface AgentToolStart {
  type: 'agentToolStart';
  id: number;
  toolId: string;
  status: string;
  toolName?: string;
  permissionActive?: boolean;
  runInBackground?: boolean;
  isTeammateSpawn?: boolean;
}

export interface AgentToolDone {
  type: 'agentToolDone';
  id: number;
  toolId: string;
}

export interface AgentToolsClear {
  type: 'agentToolsClear';
  id: number;
}

export interface AgentToolPermission {
  type: 'agentToolPermission';
  id: number;
}

export interface AgentToolPermissionClear {
  type: 'agentToolPermissionClear';
  id: number;
}

export interface SubagentToolStart {
  type: 'subagentToolStart';
  id: number;
  parentToolId: string;
  toolId: string;
  status: string;
}

export interface SubagentToolDone {
  type: 'subagentToolDone';
  id: number;
  parentToolId: string;
  toolId: string;
}

export interface SubagentClear {
  type: 'subagentClear';
  id: number;
  parentToolId: string;
}

export interface SubagentToolPermission {
  type: 'subagentToolPermission';
  id: number;
  parentToolId: string;
}

export interface AgentTeamInfo {
  type: 'agentTeamInfo';
  id: number;
  teamName?: string;
  agentName?: string;
  isTeamLead?: boolean;
  leadAgentId?: number;
  teamUsesTmux?: boolean;
}

export interface AgentTaskFinished {
  type: 'agentTaskFinished';
  id: number;
  taskId: string;
}

export interface CatProfilesLoaded {
  type: 'catProfilesLoaded';
  cats: CatProfile[];
  engineOptions: EngineOptions[];
}

export interface CatProfile {
  id: string;
  name: string;
  appearance: CatAppearance;
  role: string;
  systemPrompt: string;
  rules?: PromptItem[];
  lessons?: PromptItem[];
  promptError?: string;
  engine: CatEngine;
  model: string;
  effort: string;
  permissionMode?: PermissionMode;
  parentId: string | null;
  isDefault?: boolean;
}

export interface CatAppearance {
  breed?: string;
  colors?: CatColorLayers;
  pattern?: CatPattern;
  eyes?: string;
  collar?: string;
}

export interface CatColorLayers {
  fur?: string;
  belly?: string;
  stripe?: string;
  patchA?: string;
  patchB?: string;
  point?: string;
}

export type CatPattern =
  'solid' | 'tabby' | 'tuxedo' | 'calico' | 'tortie' | 'siamese' | 'bengal' | 'sweater';

export interface PromptItem {
  id: string;
  text: string;
}

export type CatEngine = 'claude' | 'codex';

export type PermissionMode = 'auto' | 'ask' | 'bypass' | 'readOnly';

export interface EngineOptions {
  engine: CatEngine;
  models: string[];
  efforts: string[];
  unavailable?: string;
  status?: EngineStatus;
}

export interface EngineStatus {
  installed: boolean;
  version?: string;
  loggedIn?: boolean;
  detail?: string;
  apiKey?: boolean;
}

export interface CatProfileSaved {
  type: 'catProfileSaved';
  profile: CatProfile;
}

export interface CatProfileRejected {
  type: 'catProfileRejected';
  id?: string;
  error: string;
}

export interface CatHierarchy {
  type: 'catHierarchy';
  bossId?: string;
  children: Record<string, string[]>;
}

export interface CatTurnStarted {
  type: 'catTurnStarted';
  catId: string;
  taskId: string;
  id: number;
}

export interface CatTurnFinished {
  type: 'catTurnFinished';
  catId: string;
  taskId: string;
  id: number;
  ok: boolean;
  costUsd?: number;
  inputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  outputTokens?: number;
}

export interface CatMessage {
  type: 'catMessage';
  taskId: string;
  from: string;
  to: string;
  kind: CatMessageKind;
  text: string;
}

export type CatMessageKind =
  'task' | 'brief' | 'delegate' | 'ask' | 'reply' | 'report' | 'final' | 'nudge';

export interface FlowStateChanged {
  type: 'flowStateChanged';
  taskId: string;
  state: FlowState;
  rootCatId?: string;
  catIds?: string[];
}

export type FlowState =
  | 'briefing'
  | 'delegating'
  | 'working'
  | 'reporting'
  | 'merging'
  | 'done'
  | 'error'
  | 'cancelled'
  | 'interrupted';

export interface QueueChanged {
  type: 'queueChanged';
  running: string[];
  queued: string[];
  cap: number;
}

export interface CatCharacters {
  type: 'catCharacters';
  characters: CatCharacter[];
}

export interface CatCharacter {
  catId: string;
  id: number;
  name: string;
  appearance: CatAppearance;
  working: boolean;
  lead?: boolean;
}

export interface CatCeoSettings {
  type: 'catCeoSettings';
  enabled: boolean;
  name: string;
  appearance: CatAppearance;
  model: string;
  effort: string;
  maxEditsPerCatPerDay: number;
  tidyUserItems: boolean;
  systemPrompt: string;
  permissionMode: PermissionMode;
}

export interface ReviewStarted {
  type: 'reviewStarted';
  taskId: string;
  reviewId: string;
}

export interface ReviewFinished {
  type: 'reviewFinished';
  taskId: string;
  reviewId: string;
  verdict: ReviewVerdict;
  summary: string;
  costUsd?: number;
  scores: ReviewScore[];
  edits: ReviewEdit[];
  rejectedEdits: RejectedEdit[];
}

export type ReviewVerdict = 'pass' | 'concerns' | 'fail';

export interface ReviewScore {
  catId: string;
  assignmentId: string;
  score: number;
  bubble: string;
  anomalies?: string[];
}

export interface ReviewEdit {
  catId: string;
  sha: string;
  subject: string;
  items?: string[];
}

export interface RejectedEdit {
  catId: string;
  reason: string;
}

export interface ReviewFailed {
  type: 'reviewFailed';
  taskId: string;
  reviewId: string;
  error: string;
}

export interface PromptHistory {
  type: 'promptHistory';
  catId: string;
  entries: PromptHistoryEntry[];
  lastTidy?: PromptTidyInfo;
}

export interface PromptHistoryEntry {
  sha: string;
  at: number;
  author: PromptAuthor;
  subject: string;
  taskId?: string;
  flag?: PromptFlag;
  scoreBefore?: number;
  scoreAfter?: number;
  tidy?: TidyRow[];
}

export type PromptAuthor = 'cat-ceo' | 'user' | 'guard';

export type PromptFlag = 'reverted' | 'watch' | 'manual review';

export interface TidyRow {
  op: TidyOp;
  applied: boolean;
  section: PromptSection;
  before: PromptItem[];
  after?: PromptItem;
  reason: string;
}

export type TidyOp = 'merge' | 'rewrite' | 'remove';

export type PromptSection = 'Rules' | 'Lessons';

export interface PromptTidyInfo {
  at: number;
  trigger: TidyTrigger;
  summary: string;
  sha?: string;
  costUsd?: number;
  rows: TidyRow[];
}

export type TidyTrigger = 'cap' | 'reviews' | 'manual' | 'sweep';

export interface PromptDiff {
  type: 'promptDiff';
  catId: string;
  sha: string;
  diff: string;
}

export interface PromptTidy {
  type: 'promptTidy';
  catId: string;
  state: TidyState;
  text: string;
  sha?: string;
  changed?: number;
  costUsd?: number;
}

export type TidyState = 'queued' | 'done' | 'skipped' | 'failed';

export interface NarratorLine {
  type: 'narratorLine';
  catId: number;
  state: NarratorState;
  line: string;
}

export type NarratorState =
  'thinking' | 'reading' | 'editing' | 'testing' | 'waiting' | 'done' | 'error';

export interface NarratorSummary {
  type: 'narratorSummary';
  conversationId: string;
  catIds: number[];
  summary: string;
}

export interface NarratorSettings {
  type: 'narratorSettings';
  aiSummaries: boolean;
  rawToolStatus: boolean;
}

export interface AgentContextUsage {
  type: 'agentContextUsage';
  id: number;
  contextTokens: number;
  maxContextTokens: number;
}

export interface LayoutLoaded {
  type: 'layoutLoaded';
  layout: Record<string, any> | null;
  wasReset?: boolean;
}

export interface ResetAllResult {
  type: 'resetAllResult';
  backupDir?: string;
  error?: string;
}

export interface FeedbackResult {
  type: 'feedbackResult';
  status: FeedbackStatus;
  url?: string;
  error?: string;
}

export type FeedbackStatus = 'created' | 'fallback' | 'error';

export interface PetCareLoaded {
  type: 'petCareLoaded';
  state: Record<string, any> | null;
}

export interface FurnitureAssetsLoaded {
  type: 'furnitureAssetsLoaded';
  catalog: FurnitureAssetMessage[];
  sprites: Record<string, string[][]>;
}

export interface FurnitureAssetMessage {
  id: string;
  name: string;
  label: string;
  category: string;
  file: string;
  width: number;
  height: number;
  footprintW: number;
  footprintH: number;
  isDesk: boolean;
  canPlaceOnWalls: boolean;
  groupId?: string;
  canPlaceOnSurfaces?: boolean;
  backgroundTiles?: number;
  orientation?: string;
  state?: string;
  mirrorSide?: boolean;
  rotationScheme?: string;
  animationGroup?: string;
  frame?: number;
}

export interface CharacterSpritesLoaded {
  type: 'characterSpritesLoaded';
  characters: CharacterSpriteSet[];
}

export interface CharacterSpriteSet {
  down: string[][][];
  up: string[][][];
  right: string[][][];
}

export interface PetSpritesLoaded {
  type: 'petSpritesLoaded';
  pets: PetSpriteFrameSet[];
  petNames: string[];
  petSpecies?: string[];
}

export interface PetSpriteFrameSet {
  walkDown: string[][][];
  idleDown: string[][][];
  walkUp: string[][][];
  idleUp: string[][][];
  walkRight: string[][][];
}

export interface FloorTilesLoaded {
  type: 'floorTilesLoaded';
  sprites: string[][][];
}

export interface WallTilesLoaded {
  type: 'wallTilesLoaded';
  sets: string[][][][];
}

export interface CarpetTilesLoaded {
  type: 'carpetTilesLoaded';
  sets: string[][][][];
}

export interface SettingsLoaded {
  type: 'settingsLoaded';
  soundEnabled: boolean;
  lastSeenVersion: string;
  extensionVersion: string;
  watchAllSessions: boolean;
  alwaysShowLabels: boolean;
  ghostHeadlessAgents: boolean;
  hooksEnabled: boolean;
  hooksInfoShown: boolean;
  externalAssetDirectories: string[];
  showAreas: boolean;
  showGuests?: boolean;
  turnConcurrency?: number;
}

export interface HooksStatus {
  type: 'hooksStatus';
  providerId: string;
  installed: boolean;
}

export interface HooksConsentRequest {
  type: 'hooksConsentRequest';
  providerId: string;
  headline: string;
  disclosure: string;
}

export interface ExternalAssetDirectoriesUpdated {
  type: 'externalAssetDirectoriesUpdated';
  dirs: string[];
}

export interface AreaMappingsLoaded {
  type: 'areaMappingsLoaded';
  mappings: Record<string, string[]>;
}

export interface WorkspaceFolders {
  type: 'workspaceFolders';
  folders: WorkspaceFolder[];
}

export interface WorkspaceFolder {
  name: string;
  path: string;
}

export interface AgentDiagnostics {
  type: 'agentDiagnostics';
  agents: Record<string, any>[];
}

export interface WebviewReady {
  type: 'webviewReady';
}

export interface LaunchAgent {
  type: 'launchAgent';
  folderPath?: string;
  bypassPermissions?: boolean;
}

export interface FocusAgent {
  type: 'focusAgent';
  id: number;
}

export interface CloseAgent {
  type: 'closeAgent';
  id: number;
}

export interface SaveAgentSeats {
  type: 'saveAgentSeats';
  seats: Record<string, SeatAssignment>;
}

export interface SeatAssignment {
  palette: number;
  hueShift: number;
  seatId: string | null;
}

export interface SaveLayout {
  type: 'saveLayout';
  layout: Record<string, any>;
}

export interface SavePetCare {
  type: 'savePetCare';
  state: Record<string, any>;
}

export interface SetSoundEnabled {
  type: 'setSoundEnabled';
  enabled: boolean;
}

export interface SetLastSeenVersion {
  type: 'setLastSeenVersion';
  version: string;
}

export interface SetAlwaysShowLabels {
  type: 'setAlwaysShowLabels';
  enabled: boolean;
}

export interface SetGhostHeadlessAgents {
  type: 'setGhostHeadlessAgents';
  enabled: boolean;
}

export interface SetHooksEnabled {
  type: 'setHooksEnabled';
  providerId: string;
  enabled: boolean;
}

export interface HooksConsentResponse {
  type: 'hooksConsentResponse';
  providerId: string;
  choice: HooksConsentChoice;
}

export type HooksConsentChoice = 'install' | 'notNow' | 'never';

export interface SetHooksInfoShown {
  type: 'setHooksInfoShown';
}

export interface SetWatchAllSessions {
  type: 'setWatchAllSessions';
  enabled: boolean;
}

export interface ExportLayout {
  type: 'exportLayout';
}

export interface ResetLayoutToDefault {
  type: 'resetLayoutToDefault';
}

export interface ResetAllToDefault {
  type: 'resetAllToDefault';
}

export interface ImportLayout {
  type: 'importLayout';
}

export interface OpenSessionsFolder {
  type: 'openSessionsFolder';
}

export interface AddExternalAssetDirectory {
  type: 'addExternalAssetDirectory';
  path?: string;
}

export interface RemoveExternalAssetDirectory {
  type: 'removeExternalAssetDirectory';
  path: string;
}

export interface SaveAreaMappings {
  type: 'saveAreaMappings';
  mappings: Record<string, string[]>;
}

export interface SetShowAreas {
  type: 'setShowAreas';
  enabled: boolean;
}

export interface RequestDiagnostics {
  type: 'requestDiagnostics';
}

export interface SaveCatProfile {
  type: 'saveCatProfile';
  profile: CatProfile;
}

export interface DeleteCatProfile {
  type: 'deleteCatProfile';
  id: string;
}

export interface SetCatParent {
  type: 'setCatParent';
  id: string;
  parentId: string;
}

export interface PromoteCatToBoss {
  type: 'promoteCatToBoss';
  id: string;
}

export interface SetTurnConcurrency {
  type: 'setTurnConcurrency';
  value: number;
}

export interface SetShowGuests {
  type: 'setShowGuests';
  enabled: boolean;
}

export interface SetNarratorSettings {
  type: 'setNarratorSettings';
  aiSummaries?: boolean;
  rawToolStatus?: boolean;
}

export interface SetCatCeoSettings {
  type: 'setCatCeoSettings';
  enabled?: boolean;
  name?: string;
  appearance?: CatAppearance;
  model?: string;
  effort?: string;
  maxEditsPerCatPerDay?: number;
  tidyUserItems?: boolean;
  systemPrompt?: string;
  permissionMode?: PermissionMode;
}

export interface GetPromptHistory {
  type: 'getPromptHistory';
  catId: string;
}

export interface GetPromptDiff {
  type: 'getPromptDiff';
  catId: string;
  sha: string;
}

export interface RevertPromptEdit {
  type: 'revertPromptEdit';
  catId: string;
  sha: string;
}

export interface RestorePromptVersion {
  type: 'restorePromptVersion';
  catId: string;
  sha: string;
}

export interface RemovePromptItem {
  type: 'removePromptItem';
  catId: string;
  itemId: string;
}

export interface SavePromptItem {
  type: 'savePromptItem';
  catId: string;
  section: PromptSection;
  itemId?: string;
  text: string;
}

export interface TidyPrompt {
  type: 'tidyPrompt';
  catId: string;
}

export interface CheckEngines {
  type: 'checkEngines';
}

export interface SubmitFeedback {
  type: 'submitFeedback';
  title: string;
  description: string;
  images: FeedbackImage[];
}

export interface FeedbackImage {
  name: string;
  type: string;
  data: string;
}
