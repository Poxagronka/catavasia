/**
 * One turn of the CEO desk (ceoDesk.ts): the Claude request built from the
 * queued messages and notices, and the rows the turn's activity log becomes.
 */

import * as fs from 'fs';

import type { CatSessionEntry, CatSessionFrame } from '../../../core/src/catSession.js';
import { CEO_ATTACH_MAX_COUNT, type CeoStopResponse } from '../../../core/src/ceoDesk.js';
import { CAT_CEO_ID } from '../constants.js';
import type { EngineAdapter, TurnHandle } from '../orchestrator/engineAdapter.js';
import { isAuthError } from '../orchestrator/engineStatus.js';
import type { Orchestrator } from '../orchestrator/orchestrator.js';
import { saveAttachments } from './attachments.js';
import { deskPersona, turnMessage, userPart } from './deskPrompt.js';
import { type DeskState, type DeskStore, freshDesk } from './deskStore.js';
import { DeskStream, type DeskStreamHost } from './deskStream.js';
import { DESK_MCP_NAME } from './deskTools.js';

export interface Turn {
  chatId: string;
  handle: TurnHandle;
  /** The user's messages this turn answers (edit_prompts checks `dictated` in them). */
  request: string;
  /** Rows from the turn's stream (its newest text waits: the final text replaces it). */
  stream: DeskStream;
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
  /** Every stream line of the turn (deskStream.ts makes the rows). */
  onLine: (line: string) => void;
  /** Claude's guess of the user's next message, after the turn's result. */
  onSuggestion: (text: string) => void;
}

type DeskPart = DeskState['pending'][number];

const isSlashCommand = (part: DeskPart | undefined) =>
  part?.kind === 'user' && part.text.startsWith('/');

/**
 * Take the parts of the next turn from the queue: a slash command alone (it
 * must be the whole message), else every part up to the next slash command.
 */
export function takeTurnParts(pending: DeskPart[]): DeskPart[] {
  const next = isSlashCommand(pending[0]) ? 1 : pending.findIndex(isSlashCommand);
  return pending.splice(0, next < 0 ? pending.length : next);
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
  const { adapter, office, store, state, mcpUrl, parts, onLine, onSuggestion } = input;
  // A slash command goes as typed: Claude Code runs it like in the terminal.
  const message = isSlashCommand(parts[0])
    ? parts[0].text
    : turnMessage(
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
  const cwd = turnCwd(state, chatDir);
  // Claude keys sessions by cwd: a turn in another folder starts a new session.
  if (state.started && (state.sessionCwd ?? chatDir) !== cwd) {
    state.sessionId = freshDesk().sessionId;
    state.started = false;
    state.context = undefined;
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
    partialText: true,
    askPermission: (ask) => office.approvals.ask({ catId: CAT_CEO_ID, name: settings.name }, ask),
    onLine,
    onSuggestion,
  });
}

/** Why the CEO cannot answer now (Claude Code missing or logged out); false: it can. */
export function claudeDown(adapter: EngineAdapter, office: Orchestrator): string | false {
  const missing = adapter.choices().unavailable;
  if (missing) return `${missing}.`;
  return !!office.notReady('claude') && office.engineDown('claude', false);
}

/** The error row of a failed turn; a login problem offers the login. */
export function failureRow(error: string | undefined, office: Orchestrator): CatSessionEntry {
  const auth = isAuthError(error);
  const fix = auth ? ` ${office.engineDown('claude', true)}` : '';
  const text = `The CEO could not answer: ${error}${fix}`;
  return { kind: 'error', text, ...(auth ? { login: true } : {}) };
}

/** The queued user messages and their files, which Stop gives back to the draft. */
export function queuedDraft(pending: DeskPart[]): CeoStopResponse {
  const queued = pending.filter((p) => p.kind === 'user');
  const draft = queued
    .map((p) => p.draft ?? p.text)
    .filter(Boolean)
    .join('\n\n');
  const attachments = queued.flatMap((p) => p.attachments ?? []);
  return { draft, ...(attachments.length ? { attachments } : {}) };
}

/** The cwd of the chat's next turn: the project folder, or the chat folder without one. */
export function turnCwd(state: DeskState, chatDir: string): string {
  return state.folder && fs.existsSync(state.folder) ? state.folder : chatDir;
}

/** What the desk gives a new turn's stream: its rows and its frames. */
export interface DeskRows extends Pick<DeskStreamHost, 'add' | 'update'> {
  statusChanged(): void;
  emit(frame: CatSessionFrame): void;
}

/**
 * The rows of a new turn in this chat: tool pictures are saved with the
 * chat's attachments, paths show relative to the project and chat folders;
 * the context use goes in the status, the live reply in a draft frame.
 */
export function newDeskStream(store: DeskStore, state: DeskState, desk: DeskRows): DeskStream {
  const { chatId } = state;
  const chatDir = store.chatDir(chatId);
  const saveImages: DeskStreamHost['saveImages'] = (images) => {
    const uploads = images
      .slice(0, CEO_ATTACH_MAX_COUNT)
      .map((image) => ({ name: 'picture', type: image.mediaType, data: image.data }));
    const saved = saveAttachments(chatDir, chatId, uploads);
    return 'error' in saved ? [] : saved.attachments;
  };
  // Claude may report a folder by its real path (/private/var/... on macOS).
  const folders = [state.folder, chatDir].flatMap((dir) => {
    if (!dir) return [];
    try {
      return [dir, fs.realpathSync(dir)];
    } catch {
      return [dir];
    }
  });
  const host: DeskStreamHost = {
    add: desk.add,
    update: desk.update,
    context: (use) => {
      state.context = use;
      desk.statusChanged();
    },
    draft: (text) => desk.emit({ type: 'draft', text }),
    saveImages,
    folders,
  };
  return new DeskStream(host, state.context);
}
