/**
 * The CEO dock's pure state: job cards replaced in place by jobId, desk tool
 * rows shown as actions, collapse and the unread badge, the status pill,
 * queued messages, and the saved dock in localStorage.
 *
 * Run with: npm test
 */

import { describe, expect, it } from 'vitest';

import type {
  CatSessionEntry,
  CatSessionFrame,
  CatSessionStatus,
} from '../../core/src/catSession.js';
import type { JobCard } from '../../core/src/ceoDesk.js';
import { toRows } from '../src/catTerminal/consoleState.js';
import {
  answered,
  dockFrame,
  dockGeometry,
  type DockState,
  initialDock,
  jobActions,
  parseSavedDock,
  queuedRows,
  setCollapsed,
  settingLabel,
  shortFolder,
  statusPill,
  unreadCount,
} from '../src/ceoDesk/dockState.js';

const idle: CatSessionStatus = { busy: false, wheelHeld: false, queued: 0, folder: null };

const job = (jobId: string, state: string): JobCard => ({
  jobId,
  title: 'make two files',
  target: 'team',
  leadName: 'Oliver',
  folder: '/Users/me/proj',
  state,
  turns: 1,
  nodes: [],
});

const jobFrame = (jobId: string, state: string): CatSessionFrame => ({
  type: 'job',
  text: `[Job ${jobId} · ${state}]`,
  job: job(jobId, state),
});

function run(state: DockState, ...frames: CatSessionFrame[]): DockState {
  return frames.reduce(dockFrame, state);
}

const snapshot = (status = idle): CatSessionFrame => ({
  type: 'snapshot',
  title: 'Cat CEO',
  entries: [],
  status,
});

describe('job cards', () => {
  it('a job frame adds the card once, then replaces it in place', () => {
    let s = run(initialDock(null), snapshot(), {
      type: 'entries',
      entries: [{ kind: 'user', text: 'make two files' }],
    });
    s = run(s, jobFrame('a1b2', 'briefing'), {
      type: 'entries',
      entries: [{ kind: 'text', text: 'Started.' }],
    });
    s = run(s, jobFrame('a1b2', 'working'), jobFrame('c3d4', 'working'));
    s = run(s, jobFrame('a1b2', 'done'));
    expect(
      s.chat.entries.map((e) => (e.kind === 'job' ? `${e.job.jobId}:${e.job.state}` : e.kind)),
    ).toEqual(['user', 'a1b2:done', 'text', 'c3d4:working']);
  });

  it('desk tool rows are actions; other tools still fold', () => {
    const rows = toRows([
      { kind: 'tool', name: 'Read', text: 'a' },
      { kind: 'tool', name: 'mcp__desk__start_job', text: 'Started job a1b2 → Team (Oliver)' },
      { kind: 'tool', name: 'Bash', text: 'b' },
    ]);
    expect(rows.map((r) => r.kind)).toEqual(['tools', 'action', 'tools']);
  });

  it('offers Resume and Cancel by state', () => {
    expect(jobActions({ state: 'working' })).toEqual(['cancel']);
    expect(jobActions({ state: 'interrupted' })).toEqual(['resume', 'cancel']);
    expect(jobActions({ state: 'merging' })).toEqual([]);
    expect(jobActions({ state: 'done' })).toEqual([]);
    expect(jobActions({ state: 'cancelled' })).toEqual([]);
  });
});

describe('collapse and unread', () => {
  it('opens expanded on the first run and restores the saved dock', () => {
    expect(initialDock(null).collapsed).toBe(false);
    expect(parseSavedDock(null)).toBeNull();
    expect(parseSavedDock('{oops')).toBeNull();
    expect(parseSavedDock('{"collapsed":"yes","seenAt":1}')).toBeNull();
    expect(initialDock(parseSavedDock('{"collapsed":true,"seenAt":30}'))).toMatchObject({
      collapsed: true,
      seenAt: 30,
    });
    // An older dock saved a row count: it means "seen up to now".
    expect(parseSavedDock('{"collapsed":true,"seen":3}', 500)).toEqual({
      collapsed: true,
      seenAt: 500,
    });
  });

  it('counts CEO text rows, new cards and card state changes while collapsed', () => {
    let s = run(initialDock(null), snapshot(), {
      type: 'entries',
      entries: [
        { kind: 'user', text: 'hi', at: 1 },
        { kind: 'text', text: 'hello', at: 2 },
      ],
    });
    expect(unreadCount(s)).toBe(0);
    s = run(setCollapsed(s, true), {
      type: 'entries',
      entries: [{ kind: 'job', text: '[Job a1b2]', job: job('a1b2', 'working'), at: 3 }],
    });
    expect(unreadCount(s)).toBe(1); // a new card
    s = run(
      s,
      { type: 'entries', entries: [{ kind: 'tool', name: 'Read', text: 'x', at: 4 }] },
      { type: 'entries', entries: [{ kind: 'text', text: 'Started.', at: 5 }] },
      jobFrame('a1b2', 'working'), // same state: no change
      jobFrame('a1b2', 'done'),
    );
    expect(unreadCount(s)).toBe(3);
    // The card keeps its `at` when a job frame replaces it.
    expect(s.chat.entries.find((e) => e.kind === 'job')?.at).toBe(3);
    s = setCollapsed(s, false);
    expect(unreadCount(s)).toBe(0);
    expect(s.seenAt).toBe(5);
    // Rows that arrive while open are seen.
    s = run(s, { type: 'entries', entries: [{ kind: 'text', text: 'more', at: 6 }] });
    expect(unreadCount(setCollapsed(s, true))).toBe(0);
  });

  it('a reload while collapsed counts the rows after the saved seen row', () => {
    const s = run(initialDock({ collapsed: true, seenAt: 11 }), {
      type: 'snapshot',
      title: 'Cat CEO',
      entries: [
        { kind: 'user', text: 'hi', at: 10 },
        { kind: 'text', text: 'one', at: 11 },
        { kind: 'text', text: 'two', at: 12 },
        { kind: 'text', text: 'three', at: 13 },
      ],
      status: idle,
    });
    expect(unreadCount(s)).toBe(2);
    // New chat: every row of the new history is newer than the mark.
    const fresh = run(s, {
      type: 'snapshot',
      title: 'Cat CEO',
      entries: [{ kind: 'text', text: 'new chat answer', at: 20 }],
      status: idle,
    });
    expect(unreadCount(fresh)).toBe(1);
  });

  it('the 500-row cap does not hide new rows (the mark is the row, not its index)', () => {
    const rows = (from: number, to: number): CatSessionEntry[] =>
      Array.from({ length: to - from }, (_, i) => ({
        kind: 'text' as const,
        text: `row ${from + i}`,
        at: from + i,
      }));
    // Seen up to row 599; the server keeps rows 100..599 (500).
    let s = run(initialDock({ collapsed: true, seenAt: 599 }), {
      type: 'snapshot',
      title: 'Cat CEO',
      entries: rows(100, 600),
      status: idle,
    });
    expect(unreadCount(s)).toBe(0);
    // A reload later: two new rows came and the cap dropped the two oldest. A row
    // count (500) would see nothing new here.
    s = run(initialDock({ collapsed: true, seenAt: 599 }), {
      type: 'snapshot',
      title: 'Cat CEO',
      entries: rows(102, 602),
      status: idle,
    });
    expect(s.chat.entries).toHaveLength(500);
    expect(unreadCount(s)).toBe(2);
  });
});

describe('status and queue', () => {
  it('the pill says thinking, queued, waiting on jobs, or idle', () => {
    let s = run(initialDock(null), snapshot());
    expect(statusPill(s.chat)).toEqual({ label: 'idle', tone: 'idle' });
    s = run(s, jobFrame('a1b2', 'working'), jobFrame('c3d4', 'done'));
    expect(statusPill(s.chat).label).toBe('waiting on 1 job');
    s = run(s, { type: 'status', status: { ...idle, busy: true, queued: 2 } });
    expect(statusPill(s.chat)).toEqual({ label: 'thinking · 2 queued', tone: 'busy' });
  });

  it('marks the newest user rows as queued while the CEO works', () => {
    const s = run(
      initialDock(null),
      snapshot(),
      {
        type: 'entries',
        entries: [
          { kind: 'user', text: 'first' },
          { kind: 'text', text: 'thinking about it' },
          { kind: 'user', text: 'second' },
          { kind: 'user', text: 'third' },
        ],
      },
      { type: 'status', status: { ...idle, busy: true, queued: 2 } },
    );
    const queued = [...queuedRows(s.chat)].map((e) => (e as { text: string }).text);
    expect(queued.sort()).toEqual(['second', 'third']);
    const done = run(s, { type: 'status', status: idle });
    expect(queuedRows(done.chat).size).toBe(0);
  });

  it('a turn that ends with text is an answer (the sound)', () => {
    const busy = run(initialDock(null), snapshot(), {
      type: 'status',
      status: { ...idle, busy: true },
    });
    const after = run(
      busy,
      { type: 'entries', entries: [{ kind: 'text', text: 'Done.' }] },
      { type: 'status', status: idle },
    );
    expect(answered(busy.chat, after.chat)).toBe(true);
    expect(answered(after.chat, after.chat)).toBe(false);
  });

  it('the open dock narrows a wide office and overlays a narrow one', () => {
    expect(dockGeometry(1440)).toEqual({ width: 460, footprint: 468, push: 468 });
    expect(dockGeometry(900)).toEqual({ width: 460, footprint: 468, push: 0 });
    expect(dockGeometry(400)).toEqual({ width: 384, footprint: 392, push: 0 });
  });

  it('shortens home folders', () => {
    expect(shortFolder('/Users/me/proj')).toBe('~/proj');
    expect(shortFolder('/home/me/proj')).toBe('~/proj');
    expect(shortFolder('/srv/proj')).toBe('/srv/proj');
    expect(shortFolder(null)).toBe('Sandbox');
  });

  it('labels the CEO model and effort under the composer', () => {
    expect(settingLabel('opus')).toBe('Opus');
    expect(settingLabel('medium')).toBe('Medium');
    expect(settingLabel('xhigh')).toBe('Extra high');
    expect(settingLabel('claude-opus-5-5')).toBe('Opus 5.5');
    expect(settingLabel('claude-sonnet-5-1-20260901')).toBe('Sonnet 5.1');
  });
});
