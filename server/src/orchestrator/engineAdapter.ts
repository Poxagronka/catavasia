/**
 * Engine adapter: the only seam between the cat office and an agent CLI.
 *
 * One call to `spawnTurn` is one turn of one cat: a short-lived process that
 * starts (or resumes) the cat's session, reads one user message, streams its
 * events, and exits. The prompt cache lives on the provider side, so a resumed
 * session keeps it while its TTL holds (measured: docs/catavasia/ROADMAP.md).
 * Claude Code is the first adapter; Codex is reserved (`CatEngine`).
 */

import type { CatEngine } from '../../../core/src/messages.js';
import type { TaskLogEntry } from '../../../core/src/tasks.js';
import type { StreamUsage } from '../taskBoard/streamJson.js';
import type { EngineChoices } from './catProfiles.js';

export interface TurnRequest {
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
  /** The user message of this turn. */
  message: string;
  /** Activity-log lines as they stream. */
  onLog?: (entry: TaskLogEntry) => void;
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
}

export interface TurnHandle {
  readonly done: Promise<TurnOutcome>;
  kill(): void;
}

/** Everything an office needs to give one engine's cats their office tools. */
export interface OfficeMcpEndpoint {
  url: string;
  token: string;
}

export interface EngineAdapter {
  readonly engine: CatEngine;
  /** Model and effort values the installed CLI accepts. */
  choices(): EngineChoices;
  /** File content of the MCP config that attaches the office tools. */
  mcpConfig(endpoint: OfficeMcpEndpoint): string;
  spawnTurn(req: TurnRequest): TurnHandle;
  /** Command that opens the session in a real terminal ("take the wheel"). */
  interactiveResumeCommand(sessionId: string): { command: string; args: string[] };
}
