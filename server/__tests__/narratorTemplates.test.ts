import { describe, expect, it } from 'vitest';

import { type NarratorInput } from '../../core/src/narrator.js';
import { taskLogInput } from '../src/narrator/narrator.js';
import { clipLine, PHASES, templateFor } from '../src/narrator/templates.js';

const tool = (name: string, extra: Partial<NarratorInput> = {}) =>
  templateFor({ catId: 1, ts: 0, kind: 'tool', tool: name, ...extra });
const bash = (command: string) => tool('Bash', { text: command });

const PLAN = ['thinking', 'plotting the hunt'];
const SNIFF = ['reading', 'sniffing around'];
const KNEAD = ['editing', 'kneading the code'];
const BAT = ['testing', 'batting at bugs'];
const GROOM = ['reading', 'grooming the code'];
const MOUSE = ['editing', 'bringing you a mouse'];
const MEOW = ['waiting', 'meowing for you'];

describe('narrator templates: tools', () => {
  it.each([
    ['Read', ...SNIFF],
    ['Grep', ...SNIFF],
    ['Glob', ...SNIFF],
    ['LS', ...SNIFF],
    ['NotebookRead', ...SNIFF],
    ['WebSearch', ...SNIFF],
    ['WebFetch', ...SNIFF],
    ['Edit', ...KNEAD],
    ['MultiEdit', ...KNEAD],
    ['Write', ...KNEAD],
    ['NotebookEdit', ...KNEAD],
    ['Task', 'thinking', 'herding cats'],
    ['Agent', 'thinking', 'herding cats'],
    ['Skill', 'reading', 'reading the cat manual'],
    ['TodoWrite', ...PLAN],
    ['AskUserQuestion', ...MEOW],
    ['ExitPlanMode', ...MEOW],
    ['mcp__catavasia__brief', 'thinking', 'holding a cat meeting'],
    ['mcp__catavasia__delegate', 'thinking', 'herding cats'],
    ['mcp__catavasia__report', ...MOUSE],
    ['mcp__catavasia__ask', 'waiting', 'nosing a teammate'],
    ['mcp__catavasia__reply', 'thinking', 'nosing a teammate'],
    ['mcp__catavasia__list_team', ...PLAN],
    ['mcp__github__create_issue', ...SNIFF],
    ['SomethingNew', ...PLAN],
  ])('%s -> %s / %s', (name, state, line) => {
    // A file path never leaks into the line.
    expect(tool(name, { file: '/repo/server/src/foo.ts', text: 'foo.ts' })).toEqual({
      state,
      line,
    });
  });

  it.each([
    ['npm test', ...BAT],
    ['cd server && npx vitest run', ...BAT],
    ['pytest -q tests/', ...BAT],
    ['npm run test:server', ...BAT],
    ['go test ./...', ...BAT],
    ['npm run lint', ...BAT],
    ['npx tsc --noEmit', ...BAT],
    ['npm run build', ...BAT],
    ['git commit -m "fix"', ...MOUSE],
    ['git add -A && git commit -m x', ...MOUSE],
    ['git -C /repo commit -m x', ...MOUSE],
    ['git push origin main', ...MOUSE],
    ['git merge origin/main', ...MOUSE],
    ['gh pr create --fill', ...MOUSE],
    ['gh pr merge 3 --merge', ...MOUSE],
    ['git status', ...GROOM],
    ['git diff HEAD', ...GROOM],
    ['git log --oneline', ...GROOM],
    ['gh pr view 3', ...GROOM],
    ['ls -la', ...SNIFF],
    ['npm ci', ...KNEAD],
    ['curl https://example.com', ...KNEAD],
  ])('Bash "%s" -> %s / %s', (command, state, line) => {
    expect(bash(command)).toEqual({ state, line });
  });

  it('a tool event without a tool name changes nothing', () => {
    expect(templateFor({ catId: 1, ts: 0, kind: 'tool' })).toBeNull();
  });
});

describe('narrator templates: states, messages, results', () => {
  it.each([
    ['thinking', ...PLAN],
    ['permission', 'waiting', 'pawing at the door'],
    ['input', ...MEOW],
    ['done', 'done', 'purring, all done'],
    ['error', 'error', 'hissing at a bug'],
  ])('state %s -> %s / %s', (text, state, line) => {
    expect(templateFor({ catId: 1, ts: 0, kind: 'state', text })).toEqual({ state, line });
  });

  it('an unknown state token changes nothing', () => {
    expect(templateFor({ catId: 1, ts: 0, kind: 'state', text: 'dancing' })).toBeNull();
  });

  it('a message is a teammate phase without names', () => {
    expect(templateFor({ catId: 1, ts: 0, kind: 'message', to: 'Whiskers', text: 'hi' })).toEqual({
      state: 'thinking',
      line: 'nosing a teammate',
    });
  });

  it('a result is done', () => {
    expect(templateFor({ catId: 1, ts: 0, kind: 'result', text: 'ok' })).toEqual({
      state: 'done',
      line: 'purring, all done',
    });
  });

  it('every phase line is short', () => {
    for (const p of Object.values(PHASES)) expect(p.line.length).toBeLessThanOrEqual(30);
    expect(clipLine('x'.repeat(10), 5)).toBe('xxxx…');
    expect(clipLine('short')).toBe('short');
  });
});

describe('taskLogInput', () => {
  it('maps tool, text and error log entries', () => {
    expect(taskLogInput(3, { kind: 'tool', name: 'Edit', text: '/r/a.ts' }, 5)).toEqual({
      catId: 3,
      ts: 5,
      kind: 'tool',
      tool: 'Edit',
      file: '/r/a.ts',
      text: '/r/a.ts',
    });
    expect(
      taskLogInput(3, { kind: 'tool', name: 'Bash', text: 'npm test' }, 5).file,
    ).toBeUndefined();
    expect(taskLogInput(3, { kind: 'text', text: 'hm' }, 5)).toMatchObject({
      kind: 'state',
      text: 'thinking',
    });
    expect(taskLogInput(3, { kind: 'error', text: 'x' }, 5)).toMatchObject({
      kind: 'state',
      text: 'error',
    });
  });
});
