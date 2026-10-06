import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NarratorServerMessage } from '../../core/src/narrator.js';
import {
  BACKOFF_MAX_MS,
  BATCH_INTERVAL_MS,
  ClaudeMissingError,
  haikuArgs,
  HaikuBatcher,
  runClaudeHaiku,
} from '../src/narrator/haikuBatcher.js';
import { Narrator } from '../src/narrator/narrator.js';
import type { ValidSummary } from '../src/narrator/schema.js';

/** Fake runner: records prompts, answers with the queued replies. */
function fakeRunner() {
  const prompts: string[] = [];
  const pending: Array<{ resolve: (s: string) => void; reject: (e: Error) => void }> = [];
  const run = (prompt: string) =>
    new Promise<string>((resolve, reject) => {
      prompts.push(prompt);
      pending.push({ resolve, reject });
    });
  return { run, prompts, pending };
}

const envelope = (summaries: Array<{ conversationId: string; summary: string }>) =>
  JSON.stringify({ type: 'result', is_error: false, structured_output: { summaries } });

describe('HaikuBatcher', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits for the interval and sends everything pending in ONE call', async () => {
    const r = fakeRunner();
    const got: ValidSummary[] = [];
    const b = new HaikuBatcher({ run: r.run, onSummaries: (s) => got.push(...s), log: () => {} });
    b.enqueue('c1', [1], ['Мурка → Барсик: проверь тесты']);
    b.enqueue('c2', [2], ['Итог работы: готово']);
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS - 1);
    expect(r.prompts).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(r.prompts).toHaveLength(1);
    expect(r.prompts[0]).toContain('conversationId=c1');
    expect(r.prompts[0]).toContain('conversationId=c2');
    r.pending[0].resolve(
      envelope([
        { conversationId: 'c1', summary: 'Мурка просит Барсика проверить тесты' },
        { conversationId: 'c2', summary: 'Работа готова' },
      ]),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(got.map((s) => s.conversationId)).toEqual(['c1', 'c2']);
    expect(b.pendingCount).toBe(0);
  });

  it('makes no call when nothing is pending', async () => {
    const r = fakeRunner();
    new HaikuBatcher({ run: r.run, onSummaries: () => {}, log: () => {} });
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS * 5);
    expect(r.prompts).toHaveLength(0);
  });

  it('runs one call at a time: material that arrives mid-call waits for the next tick', async () => {
    const r = fakeRunner();
    const b = new HaikuBatcher({ run: r.run, onSummaries: () => {}, log: () => {} });
    b.enqueue('c1', [1], ['a → b: раз']);
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    b.enqueue('c2', [1], ['a → b: два']);
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS * 3);
    expect(r.prompts).toHaveLength(1);
    r.pending[0].resolve(envelope([]));
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    expect(r.prompts).toHaveLength(2);
    expect(r.prompts[1]).toContain('conversationId=c2');
    expect(r.prompts[1]).not.toContain('conversationId=c1');
  });

  it('backs off after a failure (doubling, capped) and retries the same material', async () => {
    const r = fakeRunner();
    const b = new HaikuBatcher({ run: r.run, onSummaries: () => {}, log: () => {} });
    b.enqueue('c1', [1], ['a → b: раз']);
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    r.pending[0].reject(new Error('rate limited'));
    b.enqueue('c1', [1], ['a → b: два']);
    // Next try after 2x the interval, not 1x.
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS * 2 - 1);
    expect(r.prompts).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(r.prompts).toHaveLength(2);
    expect(r.prompts[1]).toContain('a → b: раз\na → b: два');

    // Keep failing: the delay never exceeds the cap.
    let delay = BATCH_INTERVAL_MS * 2;
    for (let i = 2; i < 12; i++) {
      r.pending[i - 1].reject(new Error('down'));
      delay = Math.min(delay * 2, BACKOFF_MAX_MS);
      await vi.advanceTimersByTimeAsync(delay);
      expect(r.prompts).toHaveLength(i + 1);
    }
    // A success resets the delay to the plain interval.
    r.pending[11].resolve(envelope([]));
    await vi.advanceTimersByTimeAsync(0);
    b.enqueue('c9', [1], ['x → y: снова']);
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    expect(r.prompts).toHaveLength(13);
  });

  it('a malformed reply counts as a failure', async () => {
    const r = fakeRunner();
    const b = new HaikuBatcher({ run: r.run, onSummaries: () => {}, log: () => {} });
    b.enqueue('c1', [1], ['a → b: раз']);
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    r.pending[0].resolve('not json');
    await vi.advanceTimersByTimeAsync(0);
    expect(b.pendingCount).toBe(1);
  });

  it('disables itself for good when claude is missing', async () => {
    const r = fakeRunner();
    const logs: string[] = [];
    const b = new HaikuBatcher({ run: r.run, onSummaries: () => {}, log: (m) => logs.push(m) });
    b.enqueue('c1', [1], ['a → b: раз']);
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    r.pending[0].reject(new ClaudeMissingError('spawn claude ENOENT'));
    await vi.advanceTimersByTimeAsync(0);
    expect(b.isDisabled).toBe(true);
    b.enqueue('c2', [1], ['a → b: два']);
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS * 10);
    expect(r.prompts).toHaveLength(1);
    expect(b.pendingCount).toBe(0);
    expect(logs[0]).toMatch(/not found/);
  });
});

describe('runClaudeHaiku', () => {
  it('rejects with ClaudeMissingError when the binary does not exist', async () => {
    await expect(runClaudeHaiku('x', '/nonexistent/claude-narrator-test')).rejects.toBeInstanceOf(
      ClaudeMissingError,
    );
  });

  it('uses the lean flags', () => {
    const args = haikuArgs();
    for (const flag of [
      '--json-schema',
      '--strict-mcp-config',
      '--disable-slash-commands',
      '--no-session-persistence',
    ]) {
      expect(args).toContain(flag);
    }
    expect(args[args.indexOf('--model') + 1]).toBe('haiku');
    expect(args[args.indexOf('--tools') + 1]).toBe('');
    expect(args[args.indexOf('--setting-sources') + 1]).toBe('');
  });
});

describe('Narrator facade', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function make(ai = true) {
    const sent: NarratorServerMessage[] = [];
    const r = fakeRunner();
    const n = new Narrator({
      broadcast: (m) => sent.push(m),
      aiSummariesEnabled: () => ai,
      batcher: { run: r.run, log: () => {} },
    });
    return { n, sent, r };
  }

  it('broadcasts a line only when it changes', () => {
    const { n, sent } = make();
    n.push({ catId: 4, ts: 0, kind: 'tool', tool: 'Read', file: 'a.ts' });
    n.push({ catId: 4, ts: 1, kind: 'tool', tool: 'Grep' });
    n.push({ catId: 4, ts: 2, kind: 'tool', tool: 'Edit', file: '/x/b.ts' });
    expect(sent).toEqual([
      { type: 'narratorLine', catId: 4, state: 'reading', line: 'изучает код' },
      { type: 'narratorLine', catId: 4, state: 'editing', line: 'правит b.ts' },
    ]);
    expect(n.snapshot()).toEqual([sent[1]]);
  });

  it('summarizes results and messages through Haiku, validated', async () => {
    const { n, sent, r } = make();
    n.push({ catId: 4, ts: 0, kind: 'result', text: 'Fixed the bug in foo.ts' });
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    expect(r.prompts[0]).toContain('conversationId=result:4');
    r.pending[0].resolve(
      envelope([{ conversationId: 'result:4', summary: 'Исправил баг в foo.ts. Файл сохранён ✓' }]),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(sent.at(-1)).toEqual({
      type: 'narratorSummary',
      conversationId: 'result:4',
      catIds: [4],
      summary: 'Исправил баг в foo.ts.',
    });
  });

  it('makes no Haiku call when AI summaries are off', async () => {
    const { n, r } = make(false);
    n.push({ catId: 4, ts: 0, kind: 'message', from: 'Мурка', to: 'Барсик', text: 'привет' });
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS * 3);
    expect(r.prompts).toHaveLength(0);
  });

  it('maps hook permission / input broadcasts only for cats it narrates', () => {
    const { n, sent } = make();
    n.observeBroadcast({ type: 'agentToolPermission', id: 9 });
    expect(sent).toHaveLength(0);
    n.push({ catId: 9, ts: 0, kind: 'tool', tool: 'Bash', text: 'rm -rf build' });
    n.observeBroadcast({ type: 'agentToolPermission', id: 9 });
    n.observeBroadcast({ type: 'agentStatus', id: 9, status: 'waiting', awaitingInput: true });
    expect(sent.map((m) => (m.type === 'narratorLine' ? m.line : ''))).toEqual([
      'выполняет команду',
      'ждёт разрешения',
      'ждёт ответа',
    ]);
    n.forget(9);
    expect(n.snapshot()).toEqual([]);
  });

  it('restores the work line when a hook wait clears', () => {
    const { n, sent } = make();
    n.push({ catId: 9, ts: 0, kind: 'tool', tool: 'Bash', text: 'npm test' });
    n.observeBroadcast({ type: 'agentToolPermission', id: 9 });
    n.observeBroadcast({ type: 'agentToolPermissionClear', id: 9 });
    n.observeBroadcast({ type: 'agentStatus', id: 9, status: 'waiting', awaitingInput: true });
    n.observeBroadcast({ type: 'agentStatus', id: 9, status: 'active' });
    expect(sent.map((m) => (m.type === 'narratorLine' ? m.line : ''))).toEqual([
      'гоняет тесты',
      'ждёт разрешения',
      'гоняет тесты',
      'ждёт ответа',
      'гоняет тесты',
    ]);
  });

  it('forget drops the cat summaries too', async () => {
    const { n, r } = make();
    n.push({ catId: 4, ts: 0, kind: 'result', text: 'done the task' });
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    r.pending[0].resolve(envelope([{ conversationId: 'result:4', summary: 'Задача сделана.' }]));
    await vi.advanceTimersByTimeAsync(0);
    expect(n.snapshot().some((m) => m.type === 'narratorSummary')).toBe(true);
    n.forget(4);
    expect(n.snapshot()).toEqual([]);
  });

  it('turning AI summaries off drops queued material without a call', async () => {
    let ai = true;
    const r = fakeRunner();
    const n = new Narrator({
      broadcast: () => {},
      aiSummariesEnabled: () => ai,
      batcher: { run: r.run, log: () => {} },
    });
    n.push({ catId: 4, ts: 0, kind: 'result', text: 'ok' });
    ai = false;
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS * 3);
    expect(r.prompts).toHaveLength(0);
  });
});
