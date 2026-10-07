/**
 * Engine adapter: the only seam between the cat office and an agent CLI.
 *
 * One call to `spawnTurn` is one turn of one cat: a short-lived process that
 * starts (or resumes) the cat's session, reads one user message, streams its
 * events, and exits. The CEO dock keeps one live process per chat instead
 * (`openSession`). The prompt cache lives on the provider side, so a resumed
 * session keeps it while its TTL holds (measured: docs/catavasia/ROADMAP.md).
 * Adapters: Claude Code (`claudeAdapter.ts`) and Codex (`codexAdapter.ts`).
 */

import type { CatEngine, EngineStatus, PermissionMode } from '../../../core/src/messages.js';
import type { TaskLogEntry } from '../../../core/src/tasks.js';
import type { StreamUsage } from '../taskBoard/streamJson.js';
import type { EngineChoices } from './catProfiles.js';

/** What a turn or a live session runs with (everything but the user message). */
export interface TurnSetup {
  sessionId: string;
  /** false: start the session with this id; true: resume it. */
  resume: boolean;
  cwd: string;
  model: string;
  effort?: string;
  /** File with the cat's persona and office rules (appended to the system prompt). */
  systemPromptFile: string;
  /** File with the engine's MCP config for the office server. */
  mcpConfigFile: string;
  /** What the turn may do without asking (absent: Auto). */
  permissionMode?: PermissionMode;
  /** More folders the turn may read and write (Claude only: the CEO's chat folder). */
  addDirs?: string[];
  /**
   * The mode asks the user before one action (Claude only). Absent: the
   * action is denied, as in a run with nobody to ask.
   */
  askPermission?: (ask: PermissionAsk) => Promise<PermissionAnswer>;
  /** Stream the reply text as Claude writes it (Claude only: `stream_event` lines in onLine). */
  partialText?: boolean;
  /** Activity-log lines as they stream. */
  onLog?: (entry: TaskLogEntry) => void;
  /** Every raw stream line (Claude: each Agent SDK message as stream-json), before onLog. */
  onLine?: (line: string) => void;
  /**
   * A tool started or ended, for an engine whose activity the office sees
   * only in this stream (Codex). Claude cats show tools from hooks and the
   * transcript instead, so the Claude adapter never calls it.
   */
  onActivity?: (activity: ToolActivity) => void;
  /** The engine compacted the conversation (Claude: `system/compact_boundary`). */
  onCompact?: (info: CompactInfo) => void;
}

export interface TurnRequest extends TurnSetup {
  /** The user message of this turn. */
  message: string;
  /** Image files the message carries (PNG, JPEG, GIF, WebP). */
  images?: string[];
}

/** A live session (Claude only: the CEO dock): one process that serves many turns. */
export interface SessionRequest extends TurnSetup {
  /** One turn ended (its `result`): a turn may answer several messages. */
  onResult: (outcome: TurnOutcome) => void;
  /** Claude started or ended its work (busy until every sent message is answered). */
  onBusy: (busy: boolean) => void;
  /** Claude's guess of the user's next message (SDK `prompt_suggestion`, after a result). */
  onSuggestion?: (text: string) => void;
  /** Claude Code itself changed the mode (an approved plan): the dock keeps it. */
  onMode?: (mode: PermissionMode) => void;
}

/**
 * The live session: its input stays open, like the terminal, so background
 * tasks live on between turns. Only `close` ends the process.
 */
export interface LiveSession {
  /** Send a user message now: it joins the running turn or starts the next one. Returns its id. */
  send(message: string, images?: string[]): string;
  /**
   * Stop the running turn (Esc in the terminal); the session stays. Returns
   * the ids of sent messages that did not start yet: they would still run.
   */
  interrupt(): Promise<string[]>;
  /** Stop one background task (a command or a helper) by its task id; the turn goes on. */
  stopTask(taskId: string): Promise<void>;
  /** Apply a model or mode change to the running process. False: it needs a new process. */
  update(change: Pick<TurnSetup, 'model' | 'effort' | 'permissionMode'>): boolean;
  /** End the input and the process; resolves when the process is gone. */
  close(): Promise<void>;
  /** Settles when the process ends for any reason. */
  readonly ended: Promise<SessionEnd>;
}

export interface SessionEnd {
  /** Why the process ended, when it was not closed. */
  error?: string;
  /** The CLI created or resumed the session (the next process can resume it). */
  sessionStarted: boolean;
}

/** One action the engine wants the user to allow. */
export interface PermissionAsk {
  toolName: string;
  input: Record<string, unknown>;
  /** The engine offers a rule so it does not ask again for this. */
  canAlwaysAllow: boolean;
  /** The turn ended or was killed: the question is moot. */
  signal: AbortSignal;
  /** The turn's folders: the card shows paths under them relative. */
  folders?: string[];
}

/**
 * `always`: allow and keep the engine's suggested rule. `answers`: the user
 * answered AskUserQuestion (question text -> answer). `mode`: the user
 * approved the plan (ExitPlanMode) and the session goes on in this mode.
 * `keepPlanning`: the user refused the plan, with optional words for Claude.
 */
export type PermissionAnswer =
  | 'allow'
  | 'always'
  | 'deny'
  | { answers: Record<string, string> }
  | { mode: PlanApprovalMode }
  | { keepPlanning: string };

/** The modes the plan card can switch to (the CLI's two Approve choices). */
export type PlanApprovalMode = Extract<PermissionMode, 'acceptEdits' | 'ask'>;

export type ToolActivity =
  { toolId: string; toolName: string; status: string } | { toolId: string; done: true };

export interface CompactInfo {
  trigger: string;
  preTokens?: number;
  postTokens?: number;
}

export interface TurnOutcome {
  ok: boolean;
  /** Final assistant text of the turn. */
  text?: string;
  /** Session cost so far as the CLI reports it (cumulative over resumes). */
  sessionCostUsd?: number;
  usage?: StreamUsage;
  /** Process or CLI error, when not ok. */
  error?: string;
  /** The CLI created or resumed the session (a later turn can resume it). */
  sessionStarted: boolean;
  /** The engine chose the session id itself (Codex): later turns resume this one. */
  sessionId?: string;
}

export interface TurnHandle {
  readonly done: Promise<TurnOutcome>;
  kill(): void;
}

/** Everything an office needs to give one engine's cats their office tools. */
export interface OfficeMcpEndpoint {
  url: string;
  token: string;
  /** The MCP server name the tools appear under (`mcp__<name>__<tool>`). Default: `office`. */
  name?: string;
}

export interface EngineAdapter {
  readonly engine: CatEngine;
  /** Model and effort values the installed CLI accepts. */
  choices(): EngineChoices;
  /** Installed, version, logged in (engineStatus.ts). None: always taken as ready. */
  probeStatus?(): Promise<EngineStatus>;
  /** File content of the MCP config that attaches the office tools. */
  mcpConfig(endpoint: OfficeMcpEndpoint): string;
  spawnTurn(req: TurnRequest): TurnHandle;
  /** Command that opens the session in a real terminal ("take the wheel"), in `mode`. */
  interactiveResumeCommand(
    sessionId: string,
    mode: PermissionMode,
  ): { command: string; args: string[] };
}

/** An engine that also keeps live sessions (Claude: the CEO dock). */
export interface SessionEngine extends EngineAdapter {
  /** One live process for many turns. */
  openSession(req: SessionRequest): LiveSession;
}
