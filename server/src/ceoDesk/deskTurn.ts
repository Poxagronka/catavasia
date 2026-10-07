/**
 * One turn of the CEO desk (ceoDesk.ts): the Claude request built from the
 * queued messages and notices, and the rows the turn's activity log becomes.
 */

import * as fs from 'fs';

import type { CatSessionEntry } from '../../../core/src/catSession.js';
import type { TaskLogEntry } from '../../../core/src/tasks.js';
import { toConsoleEntry } from '../catTerminal/catSessionSource.js';
import { CAT_CEO_ID } from '../constants.js';
import type { EngineAdapter, TurnHandle } from '../orchestrator/engineAdapter.js';
import type { Orchestrator } from '../orchestrator/orchestrator.js';
import { deskPersona, turnMessage, userPart } from './deskPrompt.js';
import { type DeskState, type DeskStore, freshDesk } from './deskStore.js';
import { DESK_MCP_NAME } from './deskTools.js';

const DESK_TOOL_PREFIX = `mcp__${DESK_MCP_NAME}__`;

export interface Turn {
  chatId: string;
  handle: TurnHandle;
  /** The user's messages this turn answers (edit_prompts checks `dictated` in them). */
  request: string;
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

/**
 * Start the Claude turn that answers the queued parts. The CEO is plain Claude
 * Code with its persona appended: it runs in the work folder, so it loads the
 * project's CLAUDE.md, settings, MCP servers and skills like the user's own
 * Claude Code; the chat folder (attachments) stays readable (addDirs). Its
 * permission mode comes from its settings (Auto by default); a question shows
 * an approval card in the dock.
 */
export function spawnDeskTurn(input: DeskTurnInput): TurnHandle {
  const { adapter, office, store, state, mcpUrl, parts, onLog } = input;
  const message = turnMessage(
    state.folder,
    parts.map((p) => (p.kind === 'user' ? userPart(p.text) : p.text)),
  );
  const settings = office.ceo.settings;
  const role = office.cats.prompts.read(CAT_CEO_ID).file.role;
  const { chatDir, systemPromptFile, mcpConfigFile } = store.writeTurnFiles(
    state.chatId,
    deskPersona(settings.name, role),
    adapter.mcpConfig({ url: mcpUrl, token: state.mcpToken, name: DESK_MCP_NAME }),
  );
  const cwd = state.folder && fs.existsSync(state.folder) ? state.folder : chatDir;
  // Claude keys sessions by cwd: a turn in another folder starts a new session.
  if (state.started && (state.sessionCwd ?? chatDir) !== cwd) {
    state.sessionId = freshDesk().sessionId;
    state.started = false;
  }
  state.sessionCwd = cwd;
  return adapter.spawnTurn({
    sessionId: state.sessionId,
    resume: state.started,
    cwd,
    model: settings.model,
    effort: settings.effort,
    systemPromptFile,
    mcpConfigFile,
    message,
    images: parts.flatMap((p) => p.images ?? []),
    addDirs: cwd === chatDir ? [] : [chatDir],
    permissionMode: settings.permissionMode,
    askPermission: (ask) => office.approvals.ask({ catId: CAT_CEO_ID, name: settings.name }, ask),
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
