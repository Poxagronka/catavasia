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
  return { ...state, status: frame.status };
}

export type ToolEntry = Extract<CatSessionEntry, { kind: 'tool' }>;

/** A console row: one message, or a run of consecutive tool calls folded together. */
export type ConsoleRow =
  | { kind: 'message'; entry: Exclude<CatSessionEntry, ToolEntry> }
  | { kind: 'tools'; tools: ToolEntry[] };

/** Fold consecutive tool calls into one collapsible row. */
export function toRows(entries: CatSessionEntry[]): ConsoleRow[] {
  const rows: ConsoleRow[] = [];
  for (const entry of entries) {
    const last = rows[rows.length - 1];
    if (entry.kind !== 'tool') rows.push({ kind: 'message', entry });
    else if (last?.kind === 'tools') last.tools.push(entry);
    else rows.push({ kind: 'tools', tools: [entry] });
  }
  return rows;
}

/** Why the wheel is not offered, or null when it is. */
export function wheelBlocker(status: CatSessionStatus, hasToken: boolean): string | null {
  if (!hasToken) return 'Open the page from the tokened URL the CLI printed';
  if (status.wheelUnavailable) return status.wheelUnavailable;
  if (status.wheelHeld) return 'The wheel is already taken';
  if (status.busy) return 'The cat is working: wait for the turn to end';
  return null;
}
