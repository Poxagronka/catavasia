/**
 * The live Claude session of the CEO desk (ceoDesk.ts): how it opens, the
 * message built from the user's messages and job notices, and the rows its
 * activity log becomes.
 */

import * as fs from 'fs';

import type { CatSessionEntry, CatSessionFrame } from '../../../core/src/catSession.js';
import { CEO_ATTACH_MAX_COUNT, type CeoStopResponse } from '../../../core/src/ceoDesk.js';
import { CAT_CEO_ID } from '../constants.js';
import type {
  EngineAdapter,
  LiveSession,
  SessionEngine,
  SessionRequest,
} from '../orchestrator/engineAdapter.js';
import { isAuthError } from '../orchestrator/engineStatus.js';
import type { Orchestrator } from '../orchestrator/orchestrator.js';
import { saveAttachments } from './attachments.js';
import { deskPersona, turnMessage, userPart } from './deskPrompt.js';
import { type DeskState, type DeskStore, freshDesk } from './deskStore.js';
import { DeskStream, type DeskStreamHost } from './deskStream.js';
import { DESK_MCP_NAME } from './deskTools.js';

/** The chat's live session: one Claude process for every turn of the chat. */
export interface Turn {
  session: LiveSession;
  /** The user's messages since the last result (edit_prompts checks `dictated` in them). */
  request: string;
  /** Rows from the session's stream (its newest text waits: the final text replaces it). */
  stream: DeskStream;
  /** Claude works on a message (until the session is idle). */
  busy: boolean;
  /** Stop interrupted the turn: its error result shows no error row. */
  stopped: boolean;
  /** The project folder or a setting changed that the process cannot take: open a new one. */
  stale: boolean;
  /** The persona the process runs with (a changed name or role needs a new process). */
  persona: string;
  /** The parts of each sent message by its id, until idle: Stop gives back the ones not started. */
  sent: Map<string, DeskPart[]>;
}

export type DeskSessionInput = {
  adapter: SessionEngine;
  office: Orchestrator;
  store: DeskStore;
  state: DeskState;
  mcpUrl: string;
  persona: string;
} & Pick<SessionRequest, 'onLine' | 'onResult' | 'onBusy' | 'onSuggestion'>;

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
 * The message that carries queued parts: a slash command goes as typed
 * (Claude Code runs it like in the terminal), else the work folder line and
 * every part.
 */
export function deskMessage(folder: string | null, parts: DeskPart[]): string {
  return isSlashCommand(parts[0])
    ? parts[0].text
    : turnMessage(
        folder,
        parts.map((p) => (p.kind === 'user' ? userPart(p.text) : p.text)),
      );
}

/** The CEO's settings that a live session applies (the dock's model and mode pickers). */
export function sessionSettings(office: Orchestrator): Parameters<LiveSession['update']>[0] {
  const { model, effort, permissionMode } = office.ceo.settings;
  return { model, effort, permissionMode };
}

/** The CEO's persona now: its name, Role & conduct, and the desk rules. */
export function currentPersona(office: Orchestrator): string {
  const role = office.cats.prompts.read(CAT_CEO_ID).file.role;
  return deskPersona(office.ceo.settings.name, role);
}

/**
 * Open the chat's live session. The CEO is plain Claude Code with its persona
 * appended: it runs in the work folder, so it loads the project's CLAUDE.md,
 * settings, MCP servers and skills like the user's own Claude Code; the chat
 * folder (attachments) stays readable (addDirs). Its permission mode comes
 * from its settings (Auto by default); a question shows an approval card in
 * the dock.
 */
export function openDeskSession(input: DeskSessionInput): LiveSession {
  const { adapter, office, store, state, mcpUrl } = input;
  const { chatDir, systemPromptFile, mcpConfigFile } = store.writeTurnFiles(
    state.chatId,
    input.persona,
    adapter.mcpConfig({ url: mcpUrl, token: state.mcpToken, name: DESK_MCP_NAME }),
  );
  const cwd = turnCwd(state, chatDir);
  // Claude keys sessions by cwd: a session in another folder starts a new one.
  if (state.started && (state.sessionCwd ?? chatDir) !== cwd) {
    state.sessionId = freshDesk().sessionId;
    state.started = false;
    state.context = undefined;
  }
  state.sessionCwd = cwd;
  return adapter.openSession({
    sessionId: state.sessionId,
    resume: state.started,
    cwd,
    ...sessionSettings(office),
    systemPromptFile,
    mcpConfigFile,
    addDirs: cwd === chatDir ? [] : [chatDir],
    partialText: true,
    askPermission: (ask) =>
      office.approvals.ask({ catId: CAT_CEO_ID, name: office.ceo.settings.name }, ask),
    onLine: input.onLine,
    onResult: input.onResult,
    onBusy: input.onBusy,
    onSuggestion: input.onSuggestion,
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
