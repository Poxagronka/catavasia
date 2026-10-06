import { describe, expect, it } from 'vitest';

import {
  checkPromptFile,
  parsePromptFile,
  type PromptFile,
  promptSections,
  renderPromptFile,
} from '../src/orchestrator/promptFile.js';

const FILE: PromptFile = {
  role: 'You are a careful worker.\n\n# My own heading\nStill the role.',
  rules: [
    { id: 'R1', text: 'Run `npm test` before you report. (task 9f2c, 2026-10-07)' },
    { id: 'R3', text: 'Keep diffs small.' },
  ],
  lessons: [{ id: 'L1', text: 'The webview tests need `npm run build:core` first.' }],
};

const items = (prefix: 'R' | 'L', n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, text: `item ${i + 1}` }));

describe('prompt file', () => {
  it('renders the spec format and parses it back', () => {
    const text = renderPromptFile('murka', FILE);
    expect(text.split('\n').slice(0, 5)).toEqual([
      '<!-- catavasia cat prompt v1 · cat: murka · do not rename the headings -->',
      '',
      '# Role & conduct',
      '<!-- LOCKED: only the user edits this section (Cats menu). The Cat CEO never changes it. -->',
      'You are a careful worker.',
    ]);
    expect(text).toContain(
      '# Rules\n<!-- The Cat CEO may add, replace or remove items. One line per item. -->\n- [R1] Run',
    );
    expect(parsePromptFile(text)).toEqual({ ok: true, value: FILE });
    const empty = { role: '', rules: [], lessons: [] };
    expect(parsePromptFile(renderPromptFile('x', empty))).toEqual({ ok: true, value: empty });
  });

  it('gives the cat the three sections with their headings, without the HTML notes', () => {
    const sections = promptSections(FILE);
    expect(sections).toContain('# Role & conduct\n\nYou are a careful worker.');
    expect(sections).toContain('# Rules\n\n- [R1] Run');
    expect(sections).toContain('# Lessons\n\n- [L1] The webview');
    expect(sections).not.toContain('<!--');
  });

  it('refuses missing, repeated or reordered headings and stray lines', () => {
    const good = renderPromptFile('m', FILE);
    const bad = (text: string) => {
      const result = parsePromptFile(text);
      return result.ok ? 'parsed' : result.error;
    };
    expect(bad(good.replace('# Lessons', '# Notes'))).toContain(
      '"# Lessons" must appear exactly once',
    );
    expect(bad(`${good}\n# Rules\n`)).toContain('"# Rules" must appear exactly once');
    const swapped = good
      .replace('# Rules', '# TMP')
      .replace('# Lessons', '# Rules')
      .replace('# TMP', '# Lessons');
    expect(bad(swapped)).toContain('order');
    expect(bad(good.replace('- [R3] Keep diffs small.', 'free text'))).toContain('is not an item');
    expect(bad(`hello\n${good}`)).toContain('text before');
    expect(bad(good.replace('- [L1]', '- [R9]'))).toContain('is not an item');
  });

  it('enforces the caps: 12 rules, 20 lessons, 280 chars per item, unique ids, 32 KB', () => {
    expect(
      checkPromptFile({ ...FILE, rules: items('R', 12), lessons: items('L', 20) }),
    ).toBeUndefined();
    expect(checkPromptFile({ ...FILE, rules: items('R', 13) })).toBe('more than 12 rules');
    expect(checkPromptFile({ ...FILE, lessons: items('L', 21) })).toBe('more than 20 lessons');
    expect(checkPromptFile({ ...FILE, rules: [{ id: 'R1', text: 'x'.repeat(281) }] })).toContain(
      'longer than 280',
    );
    expect(
      checkPromptFile({
        ...FILE,
        rules: [
          { id: 'R1', text: 'a' },
          { id: 'R1', text: 'b' },
        ],
      }),
    ).toContain('used twice');
    expect(checkPromptFile({ ...FILE, role: 'x'.repeat(20_001) })).toContain('Role & conduct');
    const huge = renderPromptFile('m', { ...FILE, role: 'x'.repeat(19_000) }) + '\n'.repeat(14_000);
    expect(parsePromptFile(huge)).toMatchObject({
      ok: false,
      error: expect.stringContaining('32768'),
    });
  });
});
