import { describe, expect, it } from 'vitest';

import type { CatSessionEntry, CatSessionStatus } from '../../core/src/catSession.js';
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
    expect(rows.map((r) => (r.kind === 'tools' ? r.tools.length : r.entry.kind))).toEqual([
      'user',
      2,
      'text',
      1,
    ]);
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
    expect(api.wheelBlocker(idle, false)).toContain('tokened URL');
  });
});
