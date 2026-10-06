/**
 * One turn of the CEO desk (ceoDesk.ts): the Claude request built from the
 * queued messages and notices, and the rows the turn's activity log becomes.
 */

import type { CatSessionEntry } from '../../../core/src/catSession.js';
import type { TaskLogEntry } from '../../../core/src/tasks.js';
import { toConsoleEntry } from '../catTerminal/catSessionSource.js';
import { CAT_CEO_ID } from '../constants.js';
import type { EngineAdapter, TurnHandle } from '../orchestrator/engineAdapter.js';
import type { Orchestrator } from '../orchestrator/orchestrator.js';
import { deskPersona, turnMessage, userPart } from './deskPrompt.js';
import type { DeskState, DeskStore } from './deskStore.js';
import { DESK_MCP_NAME } from './deskTools.js';

const DESK_TOOL_PREFIX = `mcp__${DESK_MCP_NAME}__`;

export interface Turn {
  chatId: string;
  handle: TurnHandle;
  /** The newest text row: the turn's full final text replaces it at the end. */
  held?: string;
  stopped: boolean;
  timer: NodeJS.Timeout;
}

export interface DeskTurnInput {
  adapter: EngineAdapter;
  office: Orchestrator;
  store: DeskStore;
  state: DeskState;
  mcpUrl: string;
  parts: DeskState['pending'];
  onLog: (entry: TaskLogEntry) => void;
}

/** Start the Claude turn that answers the queued parts. */
export function spawnDeskTurn(input: DeskTurnInput): TurnHandle {
  const { adapter, office, store, state, mcpUrl, parts, onLog } = input;
  const message = turnMessage(
    state.folder,
    parts.map((p) => (p.kind === 'user' ? userPart(p.text) : p.text)),
  );
  const settings = office.ceo.settings;
  const role = office.cats.prompts.read(CAT_CEO_ID).file.role;
  const { cwd, systemPromptFile, mcpConfigFile } = store.writeTurnFiles(
    state.chatId,
    deskPersona(settings.name, role),
    adapter.mcpConfig({ url: mcpUrl, token: state.mcpToken, name: DESK_MCP_NAME }),
  );
  return adapter.spawnTurn({
    sessionId: state.sessionId,
    resume: state.started,
    cwd,
    model: settings.model,
    effort: settings.effort,
    systemPromptFile,
    mcpConfigFile,
    message,
    onLog,
  });
}

/** Turn one log line of a live turn into chat rows (`add`). */
export function logRows(turn: Turn, entry: TaskLogEntry, add: (e: CatSessionEntry) => void): void {
  if (entry.kind === 'text') {
    if (turn.held !== undefined) add({ kind: 'text', text: turn.held });
    turn.held = entry.text;
    return;
  }
  if (entry.kind !== 'tool' && entry.kind !== 'error') return;
  // The text before a call explains it: write it before the tool's row.
  if (turn.held !== undefined) add({ kind: 'text', text: turn.held });
  turn.held = undefined;
  // Desk tools get a readable row when they run (callTool), not the raw input.
  if (entry.kind === 'tool' && entry.name?.startsWith(DESK_TOOL_PREFIX)) return;
  add(toConsoleEntry(entry));
}
