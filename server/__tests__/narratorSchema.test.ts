import { describe, expect, it } from 'vitest';

import { NARRATOR_SUMMARY_MAX_CHARS } from '../../core/src/narrator.js';
import {
  buildSummaryPrompt,
  filterSummary,
  parseSummaryOutput,
  SUMMARY_SYSTEM_PROMPT,
  type SummaryItem,
} from '../src/narrator/schema.js';

const batch: SummaryItem[] = [
  { conversationId: 'c1', catIds: [1, 2], lines: ['Mochi → Leo: check the tests in server'] },
  { conversationId: 'c2', catIds: [3], lines: ['Result: fixed 3 failing tests in foo.ts'] },
];

const out = (summaries: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'result', is_error: false, structured_output: { summaries }, ...extra });

describe('filterSummary drops claims the input does not support', () => {
  it('keeps a summary that only restates the input', () => {
    expect(filterSummary('Mochi asks Leo to check the tests.', batch[0].lines)).toBe(
      'Mochi asks Leo to check the tests.',
    );
  });

  it('drops the invented "file saved" sentence from research', () => {
    expect(filterSummary('Mochi asks Leo to check the tests. File saved ✓', batch[0].lines)).toBe(
      'Mochi asks Leo to check the tests.',
    );
  });

  it.each([
    ['Leo committed the changes.'],
    ['Tests passed.'],
    ['Fixed 5 bugs.'],
    ['Mochi edited bar.ts.'],
    ['Everything is merged into main.'],
    ['Leo deployed the app.'],
    ['Done ✓'],
    ['All done.'],
  ])('drops "%s" against a plain request', (sentence) => {
    expect(filterSummary(sentence, batch[0].lines)).toBe('');
  });

  it('keeps numbers, files and claims the input carries', () => {
    expect(filterSummary('Fixed 3 failing tests in foo.ts.', batch[1].lines)).toBe(
      'Fixed 3 failing tests in foo.ts.',
    );
  });

  it('drops a non-English summary and cuts a long one', () => {
    expect(filterSummary('Мурка просит Барсика проверить тесты', batch[0].lines)).toBe('');
    expect(filterSummary('Mochi asks Leo: проверь тесты', batch[0].lines)).toBe('');
    const long = filterSummary(
      `Mochi asks Leo ${'very '.repeat(40)}to check tests`,
      batch[0].lines,
    );
    expect(long.length).toBe(NARRATOR_SUMMARY_MAX_CHARS);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('parseSummaryOutput', () => {
  it('reads structured_output and keeps known conversations only', () => {
    const res = parseSummaryOutput(
      out([
        { conversationId: 'c1', summary: 'Mochi asks Leo to check the tests.' },
        { conversationId: 'zz', summary: 'Unknown conversation.' },
        { conversationId: 'c1', summary: 'Repeat.' },
        { conversationId: 'c2', summary: 42 },
      ]),
      batch,
    );
    expect(res).toEqual([
      { conversationId: 'c1', catIds: [1, 2], summary: 'Mochi asks Leo to check the tests.' },
    ]);
  });

  it('falls back to the result string when structured_output is absent', () => {
    const stdout = JSON.stringify({
      is_error: false,
      result: JSON.stringify({
        summaries: [{ conversationId: 'c1', summary: 'A request to check the tests.' }],
      }),
    });
    expect(parseSummaryOutput(stdout, batch)).toHaveLength(1);
  });

  it('throws on an error envelope or a shape without summaries', () => {
    expect(() => parseSummaryOutput(out([], { is_error: true }), batch)).toThrow();
    expect(() => parseSummaryOutput(JSON.stringify({ structured_output: {} }), batch)).toThrow();
    expect(() => parseSummaryOutput('garbage', batch)).toThrow();
  });
});

describe('prompt', () => {
  it('groups lines by conversation; the system prompt is static', () => {
    expect(buildSummaryPrompt(batch)).toBe(
      'conversationId=c1\nMochi → Leo: check the tests in server\n\n' +
        'conversationId=c2\nResult: fixed 3 failing tests in foo.ts',
    );
    expect(SUMMARY_SYSTEM_PROMPT).not.toMatch(/\$\{|undefined/);
  });
});
