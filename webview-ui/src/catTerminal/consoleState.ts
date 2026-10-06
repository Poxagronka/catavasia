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
  const at = entries.findIndex((e) => e.kind === 'job' && e.job.jobId === update.job.jobId);
  if (at < 0) return [...entries, row];
  const next = entries.slice();
  next[at] = row;
  return next;
}

export type ToolEntry = Extract<CatSessionEntry, { kind: 'tool' }>;

/** Tools of the CEO desk: their rows already read as sentences ("Started job a1b2 → Team (Oliver)"). */
export const DESK_TOOL_PREFIX = 'mcp__desk__';

/**
 * A console row: one message, a run of consecutive tool calls folded together,
 * or one desk action (a desk tool row, shown as is).
 */
export type ConsoleRow =
  | { kind: 'message'; entry: Exclude<CatSessionEntry, ToolEntry> }
  | { kind: 'tools'; tools: ToolEntry[] }
  | { kind: 'action'; tool: ToolEntry };

/** Fold consecutive tool calls into one collapsible row. */
export function toRows(entries: CatSessionEntry[]): ConsoleRow[] {
  const rows: ConsoleRow[] = [];
  for (const entry of entries) {
    const last = rows[rows.length - 1];
    if (entry.kind !== 'tool') rows.push({ kind: 'message', entry });
    else if (entry.name.startsWith(DESK_TOOL_PREFIX)) rows.push({ kind: 'action', tool: entry });
    else if (last?.kind === 'tools') last.tools.push(entry);
    else rows.push({ kind: 'tools', tools: [entry] });
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
