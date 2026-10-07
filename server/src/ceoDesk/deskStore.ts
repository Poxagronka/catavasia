/**
 * Files of the CEO desk under ~/.pixel-agents/cat-ceo/:
 *
 * - desk.json: the live chat (session, MCP token, cost, live jobs) and the
 *   office's project folder with the recent projects (a New chat keeps both).
 * - chats/<chatId>.json: the history of a chat (version 2, newest rows kept).
 * - chats/<chatId>/: the chat's attachments, its sandbox `work/`, and the
 *   CEO's cwd when the office has no project folder (else the folder is).
 *
 * Version 1 is the judge chat's chat.json (rows only). The first desk chat
 * starts with those rows under a divider: the CEO session does not know them.
 * New chat leaves the old history file as the archive; archived chats are
 * swept after 30 days.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import type { CatSessionEntry, ContextUse } from '../../../core/src/catSession.js';
import type { CeoAttachment } from '../../../core/src/ceoDesk.js';
import { CEO_DESK_CHATS_DIR, CEO_DESK_FILE, CEO_DESK_HISTORY_MAX } from '../constants.js';

const ARCHIVE_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

export const ADOPTED_TEXT =
  'Team tasks the server stopped (from the old Tasks board). Resume or cancel them here.';
export const LEGACY_DIVIDER = 'Earlier chat (before the CEO desk). The CEO does not remember it.';

export interface DeskState {
  version: 2;
  chatId: string;
  /** Claude session id of the CEO in this chat. */
  sessionId: string;
  /** The session exists: the next turn resumes it. */
  started: boolean;
  /** The cwd of the session (older states: the chat folder). Claude keys sessions by cwd. */
  sessionCwd?: string;
  /** The office's project folder (the Project button sets it), or null for the sandbox. */
  folder: string | null;
  /** Projects picked before, newest first. */
  recent?: string[];
  /** Bearer token of the desk tools for this chat's CEO. */
  mcpToken: string;
  /** Session cost so far (the CLI reports it cumulative). */
  costUsd: number;
  /** How full the session's context window was after the last request. */
  context?: ContextUse;
  /** The interrupted tasks of the old Tasks board joined a chat (once, on the first start). */
  boardAdopted?: boolean;
  /** Jobs of this chat whose end the CEO has not been told yet. */
  liveJobs: string[];
  /** A turn was running when the state was saved (a restart cut it). */
  turnRunning: boolean;
  /**
   * User messages and job notices that wait for the next turn (they survive a
   * restart). `images`: attached image files of a user message. `draft` and
   * `attachments`: the user's own text and files, which Stop gives back.
   */
  pending: Array<{
    kind: 'user' | 'notice';
    text: string;
    images?: string[];
    draft?: string;
    attachments?: CeoAttachment[];
  }>;
}

export type DeskRow = CatSessionEntry & { at: number };

const rand = (bytes: number) => crypto.randomBytes(bytes).toString('hex');

export function freshDesk(): DeskState {
  return {
    version: 2,
    chatId: `c-${rand(4)}`,
    sessionId: crypto.randomUUID(),
    started: false,
    folder: null,
    mcpToken: rand(24),
    costUsd: 0,
    liveJobs: [],
    turnRunning: false,
    pending: [],
  };
}

export class DeskStore {
  readonly chatsDir: string;
  private readonly deskFile: string;

  /** `dir` is ~/.pixel-agents/cat-ceo. */
  constructor(private readonly dir: string) {
    this.chatsDir = path.join(dir, CEO_DESK_CHATS_DIR);
    this.deskFile = path.join(dir, CEO_DESK_FILE);
  }

  /** The live chat, or a new first chat (with the judge chat's rows) when there is none. */
  load(now: number): DeskState {
    const saved = readJson(this.deskFile) as Partial<DeskState> | undefined;
    if (saved?.version === 2 && typeof saved.chatId === 'string' && saved.sessionId) {
      const state = { ...freshDesk(), ...saved } as DeskState;
      this.sweep(state.chatId, now);
      return state;
    }
    const state = freshDesk();
    const legacy = this.legacyRows(now);
    if (legacy.length) this.writeHistory(state.chatId, legacy);
    this.save(state);
    return state;
  }

  save(state: DeskState): void {
    writeJson(this.deskFile, state);
  }

  chatDir(chatId: string): string {
    return path.join(this.chatsDir, chatId);
  }

  /** The files of one turn: the persona, and the MCP config (it holds the token: 0600). */
  writeTurnFiles(
    chatId: string,
    persona: string,
    mcpConfig: string,
  ): { chatDir: string; systemPromptFile: string; mcpConfigFile: string } {
    const chatDir = this.chatDir(chatId);
    const systemPromptFile = path.join(this.dir, 'desk-persona.md');
    const mcpConfigFile = path.join(this.dir, 'desk-mcp.json');
    fs.mkdirSync(chatDir, { recursive: true });
    fs.writeFileSync(systemPromptFile, persona);
    fs.writeFileSync(mcpConfigFile, mcpConfig, { mode: 0o600 });
    return { chatDir, systemPromptFile, mcpConfigFile };
  }

  readHistory(chatId: string): DeskRow[] {
    const data = readJson(path.join(this.chatsDir, `${chatId}.json`)) as
      { rows?: unknown } | undefined;
    if (!Array.isArray(data?.rows)) return [];
    return (data.rows as Array<Partial<DeskRow> | null>).filter(
      (r): r is DeskRow => !!r && typeof r.kind === 'string' && typeof r.at === 'number',
    );
  }

  writeHistory(chatId: string, rows: DeskRow[]): void {
    writeJson(path.join(this.chatsDir, `${chatId}.json`), {
      version: 2,
      rows: rows.slice(-CEO_DESK_HISTORY_MAX),
    });
  }

  /** The judge chat's rows (cat-ceo/chat.json, version 1) under the divider. */
  private legacyRows(now: number): DeskRow[] {
    const data = readJson(path.join(this.dir, 'chat.json')) as { messages?: unknown } | undefined;
    if (!Array.isArray(data?.messages)) return [];
    const rows = (data.messages as Array<(Partial<DeskRow> & { text?: unknown }) | null>).filter(
      (m): m is DeskRow =>
        !!m && typeof m.text === 'string' && ['user', 'text', 'error'].includes(m.kind ?? ''),
    );
    if (!rows.length) return [];
    return [
      { kind: 'text', text: LEGACY_DIVIDER, at: now },
      ...rows.map((r) => ({ ...r, at: typeof r.at === 'number' ? r.at : now })),
    ];
  }

  /**
   * Remove archived chats untouched for 30 days: the history and the chat
   * folder (attachments, sandbox work) go together. The age is the newer of
   * the two, so a folder never outlives its history or the other way round.
   */
  private sweep(liveChatId: string, now: number): void {
    let names: string[];
    try {
      names = fs.readdirSync(this.chatsDir);
    } catch {
      return;
    }
    const ids = new Set(names.map((n) => n.replace(/\.json$/, '')));
    ids.delete(liveChatId);
    for (const id of ids) {
      const paths = [path.join(this.chatsDir, `${id}.json`), this.chatDir(id)];
      const touched = Math.max(...paths.map(mtimeOf));
      if (now - touched <= ARCHIVE_KEEP_MS) continue;
      for (const p of paths) {
        try {
          fs.rmSync(p, { recursive: true, force: true });
        } catch {
          // A locked or read-only file: the next start tries again.
        }
      }
    }
  }
}

/** Modification time, or 0 when the path is gone. */
function mtimeOf(file: string): number {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown;
  } catch {
    return undefined;
  }
}

function writeJson(file: string, data: unknown): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch (err) {
    console.error(`[catavasia] CEO desk: could not write ${file}: ${String(err)}`);
  }
}
