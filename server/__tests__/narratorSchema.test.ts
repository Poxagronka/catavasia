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
  { conversationId: 'c1', catIds: [1, 2], lines: ['Мурка → Барсик: проверь тесты в server'] },
  { conversationId: 'c2', catIds: [3], lines: ['Итог работы: fixed 3 failing tests in foo.ts'] },
];

const out = (summaries: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'result', is_error: false, structured_output: { summaries }, ...extra });

describe('filterSummary drops claims the input does not support', () => {
  it('keeps a summary that only restates the input', () => {
    expect(filterSummary('Мурка просит Барсика проверить тесты.', batch[0].lines)).toBe(
      'Мурка просит Барсика проверить тесты.',
    );
  });

  it('drops the invented "file saved" sentence from research', () => {
    expect(filterSummary('Мурка просит проверить тесты. Файл сохранён ✓', batch[0].lines)).toBe(
      'Мурка просит проверить тесты.',
    );
  });

  it.each([
    ['Барсик закоммитил изменения.'],
    ['Тесты прошли успешно.'],
    ['Исправлено 5 ошибок.'],
    ['Мурка поправила bar.ts.'],
    ['Всё смержено в main.'],
    ['Готово ✓'],
  ])('drops "%s" against a plain request', (sentence) => {
    expect(filterSummary(sentence, batch[0].lines)).toBe('');
  });

  it('keeps numbers, files and claims the input carries', () => {
    expect(filterSummary('Исправил 3 падающих теста в foo.ts.', batch[1].lines)).toBe(
      'Исправил 3 падающих теста в foo.ts.',
    );
  });

  it('drops a non-Russian summary and cuts a long one', () => {
    expect(filterSummary('Murka asks Barsik to run tests', batch[0].lines)).toBe('');
    const long = filterSummary(
      `Мурка просит ${'очень '.repeat(40)}проверить тесты`,
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
        { conversationId: 'c1', summary: 'Мурка просит Барсика проверить тесты.' },
        { conversationId: 'zz', summary: 'Неизвестный разговор.' },
        { conversationId: 'c1', summary: 'Повтор.' },
        { conversationId: 'c2', summary: 42 },
      ]),
      batch,
    );
    expect(res).toEqual([
      { conversationId: 'c1', catIds: [1, 2], summary: 'Мурка просит Барсика проверить тесты.' },
    ]);
  });

  it('falls back to the result string when structured_output is absent', () => {
    const stdout = JSON.stringify({
      is_error: false,
      result: JSON.stringify({
        summaries: [{ conversationId: 'c1', summary: 'Просьба проверить тесты.' }],
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
      'conversationId=c1\nМурка → Барсик: проверь тесты в server\n\n' +
        'conversationId=c2\nИтог работы: fixed 3 failing tests in foo.ts',
    );
    expect(SUMMARY_SYSTEM_PROMPT).not.toMatch(/\$\{|undefined/);
  });
});
