import { describe, expect, it } from 'vitest';

import type { CatSessionEntry, CatSessionStatus } from '../../core/src/catSession.js';
import { EDIT_RIGHTS_HINT } from '../../core/src/constants.js';
import * as api from '../src/catTerminal/consoleState.js';

const idle: CatSessionStatus = { busy: false, wheelHeld: false };

describe('applyFrame', () => {
  it('replaces state on a snapshot, appends entries, swaps status', () => {
    let s = api.applyFrame(api.EMPTY_CONSOLE, {
      type: 'snapshot',
      title: 'Fix bug',
      entries: [{ kind: 'user', text: 'fix it' }],
      status: idle,
    });
    expect(s).toMatchObject({ title: 'Fix bug', loaded: true });
    s = api.applyFrame(s, { type: 'entries', entries: [{ kind: 'text', text: 'done' }] });
    s = api.applyFrame(s, { type: 'status', status: { ...idle, busy: true } });
    expect(s.entries.map((e) => e.kind)).toEqual(['user', 'text']);
    expect(s.status.busy).toBe(true);
    // A reconnect snapshot replaces, never duplicates.
    s = api.applyFrame(s, { type: 'snapshot', title: 'Fix bug', entries: [], status: idle });
    expect(s.entries).toEqual([]);
  });
});

describe('toRows', () => {
  it('folds consecutive tool calls into one collapsible row', () => {
    const tool = (name: string): CatSessionEntry => ({ kind: 'tool', name, text: name });
    const rows = api.toRows([
      { kind: 'user', text: 'go' },
      tool('Read'),
      tool('Edit'),
      { kind: 'text', text: 'halfway' },
      tool('Bash'),
    ]);
    expect(
      rows.map((r) => (r.kind === 'message' ? r.entry.kind : r.kind === 'tools' && r.tools.length)),
    ).toEqual(['user', 2, 'text', 1]);
  });

  it('marks the last text of each reply: its copy and time show under it', () => {
    const rows = api.toRows([
      { kind: 'user', text: 'go' },
      { kind: 'text', text: 'looking' },
      { kind: 'tool', name: 'Read', text: 'a.ts' },
      { kind: 'text', text: 'done' },
      { kind: 'user', text: 'thanks' },
      { kind: 'text', text: 'welcome' },
    ]);
    expect(rows.map((r) => r.kind === 'message' && r.replyEnd === true)).toEqual([
      false,
      false,
      false,
      true,
      false,
      true,
    ]);
  });
});

describe('relativeTime', () => {
  it('says when a reply came in plain words', () => {
    const now = 10 * 24 * 3_600_000;
    const ago = (ms: number) => api.relativeTime(now - ms, now);
    expect(ago(5_000)).toBe('just now');
    expect(ago(2 * 60_000)).toBe('2 min ago');
    expect(ago(3_600_000)).toBe('1 hour ago');
    expect(ago(5 * 3_600_000)).toBe('5 hours ago');
    expect(ago(30 * 3_600_000)).toBe('yesterday');
    expect(ago(4 * 24 * 3_600_000)).toBe('4 days ago');
    // A clock a little behind the server: never "in the future".
    expect(ago(-2_000)).toBe('just now');
  });
});

describe('wheelBlocker', () => {
  it('offers the wheel only to an idle, free, available session', () => {
    expect(api.wheelBlocker(idle, true)).toBeNull();
    expect(api.wheelBlocker({ ...idle, busy: true }, true)).toContain('working');
    expect(api.wheelBlocker({ ...idle, wheelHeld: true }, true)).toContain('taken');
    expect(api.wheelBlocker({ ...idle, wheelUnavailable: 'No working PTY module' }, true)).toBe(
      'No working PTY module',
    );
    expect(api.wheelBlocker(idle, false)).toBe(EDIT_RIGHTS_HINT);
  });
});
