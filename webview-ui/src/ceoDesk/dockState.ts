/**
 * Pure state of the CEO dock (docs/catavasia/ROADMAP.md, "CEO desk replaces the
 * task board"): the chat folded from the `cat-ceo` session frames, collapsed or
 * expanded, and the unread badge. No DOM, so the node-side tests import it.
 *
 * Unread while collapsed = CEO text rows and new job cards after the last seen
 * row, plus job card state changes. The collapsed flag and the seen row count
 * persist in localStorage (try/catch: private windows have no storage).
 */

import type { CatSessionEntry, CatSessionFrame } from '../../../core/src/catSession.js';
import type { JobCard } from '../../../core/src/ceoDesk.js';
import { applyFrame, type CatConsoleState, EMPTY_CONSOLE } from '../catTerminal/consoleState.js';

export interface DockState {
  chat: CatConsoleState;
  collapsed: boolean;
  /** Rows the user has seen (the chat was open while they arrived). */
  seen: number;
  /** Job card state changes while collapsed. */
  jobChanges: number;
}

export interface SavedDock {
  collapsed: boolean;
  seen: number;
}

export const DOCK_STORAGE_KEY = 'catavasia.ceoDock';

/** Job states after which a job does nothing more (no Cancel, no Resume). */
const FINAL_JOB_STATES: readonly string[] = ['done', 'error', 'cancelled'];

/** The dock on page load: expanded on the first run. */
export function initialDock(saved: SavedDock | null): DockState {
  return {
    chat: EMPTY_CONSOLE,
    collapsed: saved?.collapsed ?? false,
    seen: saved?.seen ?? 0,
    jobChanges: 0,
  };
}

/** Parse the saved dock; anything malformed is a first run. */
export function parseSavedDock(raw: string | null): SavedDock | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SavedDock>;
    if (typeof value.collapsed !== 'boolean' || typeof value.seen !== 'number') return null;
    return { collapsed: value.collapsed, seen: value.seen };
  } catch {
    return null;
  }
}

/** Fold one frame of the `cat-ceo` session into the dock. */
export function dockFrame(state: DockState, frame: CatSessionFrame): DockState {
  const chat = applyFrame(state.chat, frame);
  let { seen, jobChanges } = state;
  if (frame.type === 'snapshot') {
    // A New chat (or a history the server cut) has fewer rows: clamp the count.
    seen = Math.min(seen, chat.entries.length);
    jobChanges = 0;
  }
  if (state.collapsed && frame.type === 'job') {
    const before = jobOf(state.chat.entries, frame.job.jobId);
    if (before && before.state !== frame.job.state) jobChanges++;
  }
  if (!state.collapsed) seen = chat.entries.length;
  return { chat, collapsed: state.collapsed, seen, jobChanges };
}

export function setCollapsed(state: DockState, collapsed: boolean): DockState {
  if (collapsed === state.collapsed) return state;
  // Opening the dock marks every row seen; closing it starts counting from here.
  return { ...state, collapsed, seen: state.chat.entries.length, jobChanges: 0 };
}

/** The badge of the collapsed tab. */
export function unreadCount(state: DockState): number {
  if (!state.collapsed || !state.chat.loaded) return 0;
  const fresh = state.chat.entries
    .slice(state.seen)
    .filter((e) => e.kind === 'text' || e.kind === 'job').length;
  return fresh + state.jobChanges;
}

function jobOf(entries: CatSessionEntry[], jobId: string): JobCard | undefined {
  for (const e of entries) if (e.kind === 'job' && e.job.jobId === jobId) return e.job;
  return undefined;
}

export function isLiveJob(job: Pick<JobCard, 'state'>): boolean {
  return !FINAL_JOB_STATES.includes(job.state);
}

/** Jobs of the chat that have not ended. */
export function liveJobCount(entries: CatSessionEntry[]): number {
  return entries.filter((e) => e.kind === 'job' && isLiveJob(e.job)).length;
}

/** The buttons a job card offers (task-state-machine.md T12, T14, T15). */
export function jobActions(job: Pick<JobCard, 'state'>): Array<'resume' | 'cancel'> {
  if (job.state === 'interrupted') return ['resume', 'cancel'];
  if (!isLiveJob(job) || job.state === 'merging') return [];
  return ['cancel'];
}

export interface StatusPill {
  label: string;
  tone: 'idle' | 'busy' | 'waiting';
}

/** The header pill: thinking, then queued, then waiting on jobs, else idle. */
export function statusPill(chat: CatConsoleState): StatusPill {
  const queued = chat.status.queued ?? 0;
  const jobs = liveJobCount(chat.entries);
  if (chat.status.busy) {
    return { label: queued ? `thinking · ${queued} queued` : 'thinking', tone: 'busy' };
  }
  if (queued) return { label: `queued ${queued}`, tone: 'busy' };
  if (jobs) return { label: `waiting on ${jobs} ${jobs === 1 ? 'job' : 'jobs'}`, tone: 'waiting' };
  return { label: 'idle', tone: 'idle' };
}

/**
 * User rows that wait for the next CEO turn: the newest `queued` user rows
 * (the server queues messages and job notices in order; a notice has no row,
 * so this can mark one row too many while a notice waits).
 */
export function queuedRows(chat: CatConsoleState): Set<CatSessionEntry> {
  const out = new Set<CatSessionEntry>();
  let left = chat.status.busy ? (chat.status.queued ?? 0) : 0;
  for (let i = chat.entries.length - 1; i >= 0 && left > 0; i--) {
    if (chat.entries[i].kind === 'user') {
      out.add(chat.entries[i]);
      left--;
    }
  }
  return out;
}

/** A turn ended with an answer: the dock plays the "done" sound. */
export function answered(before: CatConsoleState, after: CatConsoleState): boolean {
  return (
    before.loaded &&
    before.status.busy &&
    !after.status.busy &&
    after.entries.at(-1)?.kind === 'text'
  );
}

const DOCK_MAX_WIDTH_PX = 460;
const DOCK_MARGIN_PX = 8;
/** The office keeps at least this width beside the open dock; a narrower window overlays it. */
const OFFICE_MIN_WIDTH_PX = 640;

export interface DockGeometry {
  /** Width of the open dock. */
  width: number;
  /** The dock with its margin: right-edge panels (cat chats) stand left of it. */
  footprint: number;
  /** What the office gives up: the footprint when the window is wide enough, else 0. */
  push: number;
}

/** Where the open dock sits in a window this wide. */
export function dockGeometry(viewportWidth: number): DockGeometry {
  const width = Math.max(0, Math.min(DOCK_MAX_WIDTH_PX, viewportWidth - 2 * DOCK_MARGIN_PX));
  const footprint = width + DOCK_MARGIN_PX;
  const push = viewportWidth - footprint >= OFFICE_MIN_WIDTH_PX ? footprint : 0;
  return { width, footprint, push };
}

/** `/Users/me/proj` -> `~/proj` (the webview does not know the home folder). */
export function shortFolder(folder: string | null | undefined): string {
  if (!folder) return 'Sandbox';
  return folder.replace(/^\/(Users|home)\/[^/]+/, '~');
}
