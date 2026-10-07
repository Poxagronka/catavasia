/**
 * The chat history of the CEO desk (the chat title menu of the dock): every
 * chat under cat-ceo/chats/ with a message, newest first. chat-index.json
 * keeps what a chat's history file does not: its title, the time of its
 * newest row and the Claude session to resume. A chat archived before the
 * index existed gets its title from its first message, once.
 *
 * A chat's title is the start of its first message until Claude Code names
 * the session (it does so by itself after the first reply, no extra turn);
 * a name the user gives wins over both.
 */

import * as fs from 'fs';
import * as path from 'path';

import type { CatSessionEntry, ContextUse } from '../../../core/src/catSession.js';
import type { CeoAttachment, CeoChatSummary } from '../../../core/src/ceoDesk.js';
import {
  type DeskRow,
  type DeskState,
  type DeskStore,
  freshDesk,
  readJson,
  writeJson,
} from './deskStore.js';
import { turnCwd } from './deskTurn.js';

const INDEX_FILE = 'chat-index.json';
/** A title from a message is cut to about this many characters, at a word. */
export const CHAT_TITLE_CHARS = 40;
/** Claude Code's title is looked for after the turns of the first few user messages only. */
const TITLE_LOOKS = 3;

export const NO_MEMORY_NOTE =
  'Claude does not remember the messages above: your next message starts fresh.';
export const OTHER_FOLDER_NOTE =
  'This chat was in another project: your next message starts fresh here.';

interface IndexEntry {
  title: string;
  titleBy?: DeskState['titleBy'];
  updatedAt: number;
  /** The Claude session of the chat, when one was started. */
  session?: { id: string; cwd?: string; costUsd: number; context?: ContextUse };
}

type Index = Record<string, IndexEntry>;

/** One plain line of at most CHAT_TITLE_CHARS, cut at a word. */
export function titleFrom(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= CHAT_TITLE_CHARS) return flat;
  const cut = flat.slice(0, CHAT_TITLE_CHARS);
  const space = cut.lastIndexOf(' ');
  return `${(space > CHAT_TITLE_CHARS / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** The title a first message gives: its text, or the name of its first file. */
export function messageTitle(text: string, attachments?: CeoAttachment[]): string {
  return titleFrom(text || attachments?.[0]?.name || '');
}

function rowsTitle(rows: CatSessionEntry[]): string {
  const first = rows.find((r) => r.kind === 'user');
  return first?.kind === 'user' ? messageTitle(first.text, first.attachments) : '';
}

/** Claude Code's own title of a session (`/rename` or its automatic one); undefined: none yet. */
export async function claudeSessionTitle(
  sessionId: string,
  cwd: string,
): Promise<string | undefined> {
  try {
    // The SDK is ESM: a CommonJS build loads it on first use.
    const { getSessionInfo } = await import('@anthropic-ai/claude-agent-sdk');
    return (await getSessionInfo(sessionId, { dir: cwd }))?.customTitle?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/** What the desk lets the history do (ceoDesk.ts). */
export interface ChatHistoryHost {
  state(): DeskState;
  rows(): DeskRow[];
  /** Archive the live chat (its turn stops) and make `next` the live chat. */
  switchTo(next: DeskState, note?: string): void;
  newChat(): void;
  /** The live chat's state changed: save it and tell the dock. */
  changed(): void;
}

export class ChatHistory {
  private readonly file: string;

  constructor(
    private readonly store: DeskStore,
    private readonly host: ChatHistoryHost,
    private readonly readTitle = claudeSessionTitle,
  ) {
    this.file = path.join(path.dirname(store.chatsDir), INDEX_FILE);
  }

  /** Every chat with a message, newest first (the live one from memory). */
  list(): CeoChatSummary[] {
    const live = this.host.state();
    const rows = this.host.rows();
    const index = this.read();
    const chats: CeoChatSummary[] = [];
    const known = Object.keys(index).length;
    for (const id of this.archivedIds()) {
      const entry = id !== live.chatId && this.entry(index, id);
      if (entry) chats.push({ id, title: entry.title, updatedAt: entry.updatedAt });
    }
    if (Object.keys(index).length !== known) this.write(index);
    if (rows.length) {
      const title = live.title || rowsTitle(rows);
      chats.push({ id: live.chatId, title, updatedAt: rows[rows.length - 1].at });
    }
    return chats.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Keep the live chat's title and session before another chat replaces it. */
  archive(state: DeskState, rows: DeskRow[]): void {
    if (!rows.length) return;
    const index = this.read();
    index[state.chatId] = {
      title: state.title || rowsTitle(rows),
      ...(state.titleBy ? { titleBy: state.titleBy } : {}),
      updatedAt: rows[rows.length - 1].at,
      ...(state.started
        ? {
            session: {
              id: state.sessionId,
              ...(state.sessionCwd ? { cwd: state.sessionCwd } : {}),
              costUsd: state.costUsd,
              ...(state.context ? { context: state.context } : {}),
            },
          }
        : {}),
    };
    this.write(index);
  }

  /**
   * Make an archived chat the live one. Its Claude session resumes when the
   * next turn runs in the same folder; else a quiet note says it starts fresh.
   * False: no chat has this id.
   */
  open(id: string): boolean {
    const live = this.host.state();
    if (id === live.chatId) return true;
    const entry = this.archivedIds().includes(id) && this.entry(this.read(), id);
    if (!entry) return false;
    const { folder, recent } = live;
    const next: DeskState = {
      ...freshDesk(),
      chatId: id,
      boardAdopted: true,
      folder,
      ...(recent ? { recent } : {}),
      ...(entry.title ? { title: entry.title } : {}),
      ...(entry.titleBy ? { titleBy: entry.titleBy } : {}),
    };
    const session = entry.session;
    if (session) {
      Object.assign(next, { sessionId: session.id, started: true, costUsd: session.costUsd });
      if (session.cwd) next.sessionCwd = session.cwd;
      if (session.context) next.context = session.context;
    }
    const chatDir = this.store.chatDir(id);
    const cwd = turnCwd(next, chatDir);
    const note = !session
      ? NO_MEMORY_NOTE
      : (next.sessionCwd ?? chatDir) !== cwd
        ? OTHER_FOLDER_NOTE
        : undefined;
    const last = this.store.readHistory(id).at(-1);
    const noted = last?.kind === 'note' && last.text === note;
    this.host.switchTo(next, noted ? undefined : note);
    return true;
  }

  /** The user's name for a chat. False: no chat has this id. */
  rename(id: string, title: string): boolean {
    const name = title.replace(/\s+/g, ' ').trim();
    const live = this.host.state();
    if (id === live.chatId) {
      live.title = name;
      live.titleBy = 'user';
      this.host.changed();
      return true;
    }
    const index = this.read();
    const entry = this.archivedIds().includes(id) && this.entry(index, id);
    if (!entry) return false;
    index[id] = { ...entry, title: name, titleBy: 'user' };
    this.write(index);
    return true;
  }

  /** Delete a chat: its history, files and sandbox. The live chat is replaced by a new one. */
  remove(id: string): boolean {
    const live = this.host.state();
    if (id !== live.chatId && !this.archivedIds().includes(id)) return false;
    if (id === live.chatId) this.host.newChat();
    for (const p of [path.join(this.store.chatsDir, `${id}.json`), this.store.chatDir(id)]) {
      try {
        fs.rmSync(p, { recursive: true, force: true });
      } catch {
        // A locked file stays; the chat is gone from the list with its history.
      }
    }
    const index = this.read();
    delete index[id];
    this.write(index);
    return true;
  }

  /**
   * After a turn: take Claude Code's title of the session while the title is
   * still the first message's (Claude names a session after its first reply).
   */
  nameFromClaude(): void {
    const state = this.host.state();
    if (state.titleBy || !state.started || !state.sessionCwd) return;
    // Claude names the session after its first reply: later turns do not look again.
    if (this.host.rows().filter((r) => r.kind === 'user').length > TITLE_LOOKS) return;
    void this.readTitle(state.sessionId, state.sessionCwd).then((title) => {
      if (!title || this.host.state() !== state || state.titleBy) return;
      state.title = titleFrom(title);
      state.titleBy = 'claude';
      this.host.changed();
    });
  }

  /** The index entry of an archived chat; an old chat gets one from its rows. Undefined: no message. */
  private entry(index: Index, id: string): IndexEntry | undefined {
    if (index[id]) return index[id];
    const rows = this.store.readHistory(id);
    if (!rows.length) return undefined;
    index[id] = { title: rowsTitle(rows), updatedAt: rows[rows.length - 1].at };
    return index[id];
  }

  private archivedIds(): string[] {
    try {
      return fs
        .readdirSync(this.store.chatsDir)
        .filter((n) => n.endsWith('.json'))
        .map((n) => n.slice(0, -'.json'.length));
    } catch {
      return [];
    }
  }

  private read(): Index {
    const data = readJson(this.file) as { chats?: Index } | undefined;
    return data?.chats && typeof data.chats === 'object' ? data.chats : {};
  }

  private write(index: Index): void {
    writeJson(this.file, { version: 1, chats: index });
  }
}
