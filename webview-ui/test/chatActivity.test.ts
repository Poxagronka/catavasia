/**
 * Tool activity in the chat (the Claude app look, plain words): the summary
 * line, one line per call, thoughts in the run, row updates, tool pictures,
 * and the context ring's texts.
 */

import assert from 'node:assert/strict';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'vitest';

import type { CatSessionEntry } from '../../core/src/catSession.js';
import { activityLine, activitySummary, duration } from '../src/catTerminal/activityWords.js';
import { applyFrame, EMPTY_CONSOLE, toRows } from '../src/catTerminal/consoleState.js';
import { ToolRow } from '../src/catTerminal/ToolActivity.js';
import { contextText, percent, resetText } from '../src/ceoDesk/dockState.js';

const tool = (name: string, text = '', extra: object = {}): CatSessionEntry => ({
  kind: 'tool',
  name,
  text,
  ...extra,
});

test('the summary line says what the tools did in plain words', () => {
  const run = [
    { kind: 'thought' as const, ms: 2400 },
    tool('Read', 'a.ts'),
    tool('Bash', 'npm test'),
    tool('Read', 'b.ts'),
    tool('Grep', 'TODO'),
    tool('Bash', 'ls'),
    { kind: 'thought' as const, ms: 1000 },
    tool('mcp__claude_ai_Google_Drive__search', 'x'),
    tool('Frobnicate'),
  ] as Parameters<typeof activitySummary>[0];
  assert.equal(
    activitySummary(run),
    'Thought for 3s, looked at 2 files, ran 2 commands, searched the files, used Google Drive, used a tool',
  );
  assert.equal(activitySummary([tool('Edit', 'a') as never]), 'Changed a file');
  assert.equal(activitySummary([{ kind: 'thought', ms: 300 }]), 'Thought for 1s');
  assert.equal(duration(65_000), '1m 5s');
});

test('each call has its own plain line', () => {
  assert.deepEqual(activityLine(tool('Bash', 'npm test') as never), {
    verb: 'Ran',
    target: 'npm test',
  });
  assert.deepEqual(activityLine(tool('WebSearch', 'cats') as never), {
    verb: 'Searched the web for',
    target: 'cats',
  });
  assert.deepEqual(activityLine(tool('Bash', 'ls', { about: 'List the files' }) as never), {
    verb: 'List the files',
    target: '',
  });
  assert.deepEqual(activityLine({ kind: 'thought', ms: 2000 }), {
    verb: 'Thought for 2s',
    target: '',
  });
});

test('thoughts join the run of tool calls; a desk action stays its own row', () => {
  const rows = toRows([
    { kind: 'user', text: 'hi' },
    { kind: 'thought', ms: 1000 },
    tool('Read', 'a.ts'),
    tool('mcp__desk__start_job', 'Started job a1'),
    { kind: 'text', text: 'Done.' },
  ]);
  assert.deepEqual(
    rows.map((r) => r.kind),
    ['message', 'tools', 'action', 'message'],
  );
  assert.equal(rows[1].kind === 'tools' && rows[1].tools.length, 2);
});

test('an update frame replaces the row with the same `at`', () => {
  let state = applyFrame(EMPTY_CONSOLE, {
    type: 'snapshot',
    title: 'CEO',
    status: { busy: true, wheelHeld: false },
    entries: [{ kind: 'user', text: 'hi', at: 1 }, tool('Bash', 'ls', { at: 2 })],
  });
  state = applyFrame(state, {
    type: 'update',
    entry: tool('Bash', 'ls', { at: 2, result: 'a b' }),
  });
  assert.deepEqual(state.entries[1], tool('Bash', 'ls', { at: 2, result: 'a b' }));
  assert.equal(state.entries.length, 2);
});

test('a tool run shows its summary, its calls, and the pictures it returned', () => {
  const html = renderToStaticMarkup(
    createElement(ToolRow, {
      tools: [
        tool('Read', 'red.png', {
          result: 'ok',
          images: [
            { name: 'picture', size: 75, image: true, url: '/api/ceo/attachments/c-1/x.png' },
          ],
        }),
        tool('Bash', 'npm test', { input: '{"command":"npm test"}', isError: true }),
      ] as never,
    }),
  );
  assert.match(html, /Looked at a file, ran a command/);
  assert.match(html, /Looked at.*red\.png/);
  assert.match(html, /did not work/);
  assert.match(html, /data-testid="tool-thumb"[^>]*|<img[^>]*tool-thumb/);
  assert.match(html, /\/api\/ceo\/attachments\/c-1\/x\.png/);
});

test('the context ring and the limits in plain words', () => {
  assert.equal(contextText({ used: 84_000, window: 200_000 }), 'Context: 42% used');
  assert.equal(contextText(undefined), 'Context: shown after the first answer');
  assert.equal(percent(0.001), '1%');
  assert.equal(percent(0), '0%');
  // 2026-10-12 is a Monday.
  const monday = Date.UTC(2026, 9, 12, 12) / 1000;
  assert.equal(resetText({ used: 0.5, resetsAt: monday }, true, 'en-US'), 'resets Mon');
  assert.match(
    resetText({ used: 0.5, resetsAt: monday }, false, 'en-GB'),
    /^resets at \d{1,2}:\d\d$/,
  );
});
