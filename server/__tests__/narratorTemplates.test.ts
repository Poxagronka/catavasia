import { describe, expect, it } from 'vitest';

import { NARRATOR_LINE_MAX_CHARS, type NarratorInput } from '../../core/src/narrator.js';
import { taskLogInput } from '../src/narrator/narrator.js';
import { clipLine, templateFor } from '../src/narrator/templates.js';

const tool = (name: string, extra: Partial<NarratorInput> = {}) =>
  templateFor({ catId: 1, ts: 0, kind: 'tool', tool: name, ...extra });
const bash = (command: string) => tool('Bash', { text: command });

describe('narrator templates: tools', () => {
  it.each(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead'])('%s -> reading code', (name) => {
    expect(tool(name, { file: '/a/b.ts' })).toEqual({ state: 'reading', line: 'reading code' });
  });

  it.each(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])('%s -> editing <basename>', (name) => {
    expect(tool(name, { file: '/repo/server/src/foo.ts' })).toEqual({
      state: 'editing',
      line: 'editing foo.ts',
    });
    expect(tool(name)).toEqual({ state: 'editing', line: 'editing code' });
  });

  it.each([
    ['WebSearch', 'reading', 'searching the web'],
    ['WebFetch', 'reading', 'reading a web page'],
    ['Task', 'thinking', 'delegating a subtask'],
    ['Agent', 'thinking', 'delegating a subtask'],
    ['TodoWrite', 'thinking', 'making a plan'],
    ['AskUserQuestion', 'waiting', 'waiting for your input'],
    ['ExitPlanMode', 'waiting', 'waiting for plan approval'],
    ['mcp__catavasia__delegate', 'thinking', 'delegating tasks'],
    ['mcp__catavasia__brief', 'thinking', 'holding a briefing'],
    ['mcp__catavasia__report', 'thinking', 'writing a report'],
    ['mcp__catavasia__ask', 'waiting', 'asking a teammate'],
    ['mcp__catavasia__reply', 'thinking', 'replying to a teammate'],
    ['mcp__catavasia__list_team', 'thinking', 'checking the team'],
    ['mcp__github__create_issue', 'thinking', 'using an external tool'],
    ['SomethingNew', 'thinking', 'working'],
  ])('%s -> %s / %s', (name, state, line) => {
    expect(tool(name)).toEqual({ state, line });
  });

  it.each([
    ['npm test', 'testing', 'running tests'],
    ['cd server && npx vitest run', 'testing', 'running tests'],
    ['pytest -q tests/', 'testing', 'running tests'],
    ['npm run test:server', 'testing', 'running tests'],
    ['go test ./...', 'testing', 'running tests'],
    ['git commit -m "fix"', 'editing', 'committing'],
    ['git add -A && git commit -m x', 'editing', 'committing'],
    ['git -C /repo commit -m x', 'editing', 'committing'],
    ['git push origin main', 'editing', 'pushing changes'],
    ['git merge origin/main', 'editing', 'merging branches'],
    ['git status', 'reading', 'checking git history'],
    ['gh pr create --fill', 'editing', 'opening a pull request'],
    ['npm run lint', 'testing', 'running the linter'],
    ['npx tsc --noEmit', 'testing', 'running the linter'],
    ['npm run build', 'testing', 'building the project'],
    ['npm ci', 'editing', 'installing dependencies'],
    ['ls -la', 'reading', 'reading code'],
    ['curl https://example.com', 'editing', 'running a command'],
  ])('Bash "%s" -> %s / %s', (command, state, line) => {
    expect(bash(command)).toEqual({ state, line });
  });

  it('a tool event without a tool name changes nothing', () => {
    expect(templateFor({ catId: 1, ts: 0, kind: 'tool' })).toBeNull();
  });
});

describe('narrator templates: states, messages, results', () => {
  it.each([
    ['thinking', 'thinking', 'thinking'],
    ['permission', 'waiting', 'waiting for permission'],
    ['input', 'waiting', 'waiting for your input'],
    ['done', 'done', 'done'],
    ['error', 'error', 'error'],
  ])('state %s -> %s / %s', (text, state, line) => {
    expect(templateFor({ catId: 1, ts: 0, kind: 'state', text })).toEqual({ state, line });
  });

  it('an unknown state token changes nothing', () => {
    expect(templateFor({ catId: 1, ts: 0, kind: 'state', text: 'dancing' })).toBeNull();
  });

  it('a message names the receiver', () => {
    expect(templateFor({ catId: 1, ts: 0, kind: 'message', to: 'Whiskers', text: 'hi' })).toEqual({
      state: 'thinking',
      line: 'messaging Whiskers',
    });
    expect(templateFor({ catId: 1, ts: 0, kind: 'message', text: 'hi' })?.line).toBe(
      'talking to a teammate',
    );
  });

  it('a result is done', () => {
    expect(templateFor({ catId: 1, ts: 0, kind: 'result', text: 'ok' })).toEqual({
      state: 'done',
      line: 'handed in the result',
    });
  });

  it('every line fits the limit, a long file name is cut with an ellipsis', () => {
    const long = `${'x'.repeat(100)}.ts`;
    const t = tool('Edit', { file: `/a/${long}` });
    expect(t?.line.length).toBe(NARRATOR_LINE_MAX_CHARS);
    expect(t?.line.endsWith('…')).toBe(true);
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
