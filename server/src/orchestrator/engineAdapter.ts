/**
 * Engine adapter: the only seam between the cat office and an agent CLI.
 *
 * One call to `spawnTurn` is one turn of one cat: a short-lived process that
 * starts (or resumes) the cat's session, reads one user message, streams its
 * events, and exits. The prompt cache lives on the provider side, so a resumed
 * session keeps it while its TTL holds (measured: docs/catavasia/ROADMAP.md).
 * Adapters: Claude Code (`claudeAdapter.ts`) and Codex (`codexAdapter.ts`).
 */

import type { CatEngine, EngineStatus } from '../../../core/src/messages.js';
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
  /** Image files the message carries (PNG, JPEG, GIF, WebP). */
  images?: string[];
  /** CLI arguments after the adapter's own (Claude only). */
  extraArgs?: string[];
  /** Keep the user's own MCP servers beside the office server (Claude only). */
  userMcp?: boolean;
  /** Activity-log lines as they stream. */
  onLog?: (entry: TaskLogEntry) => void;
  /**
   * A tool started or ended, for an engine whose activity the office sees
   * only in this stream (Codex). Claude cats show tools from hooks and the
   * transcript instead, so the Claude adapter never calls it.
   */
  onActivity?: (activity: ToolActivity) => void;
  /** The engine compacted the conversation (Claude: `system/compact_boundary`). */
  onCompact?: (info: CompactInfo) => void;
}

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
  /** The turn stopped at its --max-budget-usd cap (Claude only). */
  budgetHit?: boolean;
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
  /** Command that opens the session in a real terminal ("take the wheel"). */
  interactiveResumeCommand(sessionId: string): { command: string; args: string[] };
}
