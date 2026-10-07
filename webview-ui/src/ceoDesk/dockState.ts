/**
 * Pure state of the CEO dock (docs/catavasia/ROADMAP.md, "CEO desk replaces the
 * task board"): the chat folded from the `cat-ceo` session frames, collapsed or
 * expanded, and the unread badge. No DOM, so the node-side tests import it.
 *
 * Unread while collapsed = CEO text rows and new job cards after the last seen
 * row, plus job card state changes. The last seen row is marked by its `at`
 * (unique and rising in a chat), so the 500-row cap does not shift it. The
 * collapsed flag and that mark persist in localStorage (try/catch: private
 * windows have no storage).
 */

import type {
  CatSessionEntry,
  CatSessionFrame,
  ContextUse,
  LimitWindow,
} from '../../../core/src/catSession.js';
import type { JobCard } from '../../../core/src/ceoDesk.js';
import { applyFrame, type CatConsoleState, EMPTY_CONSOLE } from '../catTerminal/consoleState.js';

export interface DockState {
  chat: CatConsoleState;
  collapsed: boolean;
  /** `at` of the newest row the user has seen (the chat was open); 0 = none. */
  seenAt: number;
  /** Job card state changes while collapsed. */
  jobChanges: number;
}

export interface SavedDock {
  collapsed: boolean;
  seenAt: number;
}

export const DOCK_STORAGE_KEY = 'catavasia.ceoDock';

/** Job states after which a job does nothing more (no Cancel, no Resume). */
const FINAL_JOB_STATES: readonly string[] = ['done', 'error', 'cancelled'];

/** The dock on page load: expanded on the first run. */
export function initialDock(saved: SavedDock | null): DockState {
  return {
    chat: EMPTY_CONSOLE,
    collapsed: saved?.collapsed ?? false,
    seenAt: saved?.seenAt ?? 0,
    jobChanges: 0,
  };
}

/**
 * Parse the saved dock; anything malformed is a first run. An older dock saved
 * a row count (`seen`): it becomes "seen up to `now`".
 */
export function parseSavedDock(raw: string | null, now = Date.now()): SavedDock | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SavedDock> & { seen?: unknown };
    if (typeof value.collapsed !== 'boolean') return null;
    if (typeof value.seenAt === 'number')
      return { collapsed: value.collapsed, seenAt: value.seenAt };
    return typeof value.seen === 'number' ? { collapsed: value.collapsed, seenAt: now } : null;
  } catch {
    return null;
  }
}

/** `at` of the newest row (0 when no row has one). */
function newestAt(entries: CatSessionEntry[]): number {
  return entries.reduce((max, e) => Math.max(max, e.at ?? 0), 0);
}

/** Fold one frame of the `cat-ceo` session into the dock. */
export function dockFrame(state: DockState, frame: CatSessionFrame): DockState {
  const chat = applyFrame(state.chat, frame);
  let { seenAt, jobChanges } = state;
  if (frame.type === 'snapshot') jobChanges = 0;
  if (state.collapsed && frame.type === 'job') {
    const before = jobOf(state.chat.entries, frame.job.jobId);
    if (before && before.state !== frame.job.state) jobChanges++;
  }
  if (!state.collapsed) seenAt = Math.max(seenAt, newestAt(chat.entries));
  return { chat, collapsed: state.collapsed, seenAt, jobChanges };
}

export function setCollapsed(state: DockState, collapsed: boolean): DockState {
  if (collapsed === state.collapsed) return state;
  // Opening the dock marks every row seen; closing it starts counting from here.
  return {
    ...state,
    collapsed,
    seenAt: Math.max(state.seenAt, newestAt(state.chat.entries)),
    jobChanges: 0,
  };
}

/** The badge of the collapsed tab. */
export function unreadCount(state: DockState): number {
  if (!state.collapsed || !state.chat.loaded) return 0;
  const { entries } = state.chat;
  // After the seen row when it is still there; else every row newer than it
  // (a row with no `at` yet is new).
  let seenRow = -1;
  entries.forEach((e, i) => {
    if (e.at === state.seenAt) seenRow = i;
  });
  const after =
    seenRow >= 0
      ? entries.slice(seenRow + 1)
      : entries.filter((e) => (e.at ?? Infinity) > state.seenAt);
  const fresh = after.filter((e) => e.kind === 'text' || e.kind === 'job').length;
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

/** The project's name for the bottom bar: the folder's last part, or "No project". */
export function projectName(folder: string | null | undefined): string {
  if (!folder) return 'No project';
  return (
    folder
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop() || folder
  );
}

/**
 * A model or effort value as a short label under the composer: "opus" -> "Opus",
 * a full model name with its version "claude-opus-5-5" -> "Opus 5.5".
 */
export function settingLabel(value: string): string {
  if (value === 'xhigh') return 'Extra high';
  const full = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(value);
  if (full) return `${settingLabel(full[1])} ${full[2]}.${full[3]}`;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** 0..1 -> "42%" (a little use shows as 1%, never 0% by rounding). */
export function percent(part: number): string {
  const p = Math.round(Math.min(1, Math.max(0, part)) * 100);
  return `${p === 0 && part > 0 ? 1 : p}%`;
}

/** "Context: 42% used", or that it is not known yet. */
export function contextText(context: ContextUse | undefined): string {
  return context
    ? `Context: ${percent(context.used / context.window)} used`
    : 'Context: shown after the first answer';
}

/** "resets at 17:00" (5-hour) or "resets Mon" (weekly). */
export function resetText(window: LimitWindow, weekly: boolean, locale?: string): string {
  const at = new Date(window.resetsAt * 1000);
  return weekly
    ? `resets ${at.toLocaleDateString(locale, { weekday: 'short' })}`
    : `resets at ${at.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}`;
}
