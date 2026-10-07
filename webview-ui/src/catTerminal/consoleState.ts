/**
 * Pure console state for the cat terminal: how server frames fold into the
 * view, how tool calls group into rows, and when the wheel is offered. No DOM,
 * so the node-side tests import it directly.
 */

import type {
  CatSessionEntry,
  CatSessionFrame,
  CatSessionStatus,
} from '../../../core/src/catSession.js';
import { EDIT_RIGHTS_HINT } from '../../../core/src/constants.js';

/** What the console renders: the frames folded into one view. */
export interface CatConsoleState {
  title: string;
  entries: CatSessionEntry[];
  status: CatSessionStatus;
  /** False until the first snapshot arrives. */
  loaded: boolean;
}

export const EMPTY_CONSOLE: CatConsoleState = {
  title: '',
  entries: [],
  status: { busy: false, wheelHeld: false },
  loaded: false,
};

/** Fold one server frame into the console state. */
export function applyFrame(state: CatConsoleState, frame: CatSessionFrame): CatConsoleState {
  if (frame.type === 'snapshot') {
    return { title: frame.title, entries: frame.entries, status: frame.status, loaded: true };
  }
  if (frame.type === 'entries') return { ...state, entries: [...state.entries, ...frame.entries] };
  if (frame.type === 'job') return { ...state, entries: upsertJob(state.entries, frame) };
  return { ...state, status: frame.status };
}

type JobEntry = Extract<CatSessionEntry, { kind: 'job' }>;

/** A job card update (CEO desk): replace the card with this jobId in place, or add it. */
export function upsertJob(
  entries: CatSessionEntry[],
  update: Omit<JobEntry, 'kind'>,
): CatSessionEntry[] {
  const row: JobEntry = { kind: 'job', text: update.text, job: update.job };
  const i = entries.findIndex((e) => e.kind === 'job' && e.job.jobId === update.job.jobId);
  if (i < 0) return [...entries, row];
  const next = entries.slice();
  // The card keeps its place and its `at` (the dock's unread mark).
  next[i] = { ...row, ...(entries[i].at !== undefined ? { at: entries[i].at } : {}) };
  return next;
}

export type ToolEntry = Extract<CatSessionEntry, { kind: 'tool' }>;

/** Tools of the CEO desk: their rows already read as sentences ("Gave the job to Oliver's team"). */
export const DESK_TOOL_PREFIX = 'mcp__desk__';

/**
 * A console row: one message, a run of consecutive tool calls folded together,
 * or one desk action (a desk tool row, shown as is).
 */
export type ConsoleRow =
  /**
   * `replyEnd`: the last text of a reply (no more text before the next message): its actions
   * show on hover. `lastReply`: the newest reply end of the chat: its actions always show.
   */
  | {
      kind: 'message';
      entry: Exclude<CatSessionEntry, ToolEntry>;
      replyEnd?: boolean;
      lastReply?: boolean;
    }
  | { kind: 'tools'; tools: ToolEntry[] }
  | { kind: 'action'; tool: ToolEntry };

/** Fold consecutive tool calls into one collapsible row; mark where each reply ends. */
export function toRows(entries: CatSessionEntry[]): ConsoleRow[] {
  const rows: ConsoleRow[] = [];
  for (const entry of entries) {
    const last = rows[rows.length - 1];
    if (entry.kind !== 'tool') rows.push({ kind: 'message', entry });
    else if (entry.name.startsWith(DESK_TOOL_PREFIX)) rows.push({ kind: 'action', tool: entry });
    else if (last?.kind === 'tools') last.tools.push(entry);
    else rows.push({ kind: 'tools', tools: [entry] });
  }
  // Backward: a text ends its reply unless more text comes before the next other message.
  let nextIsText = false;
  let seenReply = false;
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row.kind !== 'message') continue;
    if (row.entry.kind === 'text' && !nextIsText) {
      row.replyEnd = true;
      if (!seenReply) row.lastReply = seenReply = true;
    }
    nextIsText = row.entry.kind === 'text';
  }
  return rows;
}

/** Why the wheel is not offered, or null when it is. */
export function wheelBlocker(status: CatSessionStatus, hasToken: boolean): string | null {
  if (!hasToken) return EDIT_RIGHTS_HINT;
  if (status.wheelUnavailable) return status.wheelUnavailable;
  if (status.wheelHeld) return 'The wheel is already taken';
  if (status.busy) return 'The cat is working: wait for the turn to end';
  return null;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** When a reply came, in plain words: "just now", "2 min ago", "3 hours ago", "yesterday", "4 days ago". */
export function relativeTime(at: number, now: number): string {
  const ago = Math.max(0, now - at);
  if (ago < MINUTE_MS) return 'just now';
  if (ago < HOUR_MS) return `${Math.floor(ago / MINUTE_MS)} min ago`;
  if (ago < DAY_MS) {
    const hours = Math.floor(ago / HOUR_MS);
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  const days = Math.floor(ago / DAY_MS);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
