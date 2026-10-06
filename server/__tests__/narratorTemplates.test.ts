import { describe, expect, it } from 'vitest';

import { NARRATOR_LINE_MAX_CHARS, type NarratorInput } from '../../core/src/narrator.js';
import { taskLogInput } from '../src/narrator/narrator.js';
import { clipLine, templateFor } from '../src/narrator/templates.js';

const tool = (name: string, extra: Partial<NarratorInput> = {}) =>
  templateFor({ catId: 1, ts: 0, kind: 'tool', tool: name, ...extra });
const bash = (command: string) => tool('Bash', { text: command });

describe('narrator templates: tools', () => {
  it.each(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead'])('%s -> изучает код', (name) => {
    expect(tool(name, { file: '/a/b.ts' })).toEqual({ state: 'reading', line: 'изучает код' });
  });

  it.each(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])('%s -> правит <basename>', (name) => {
    expect(tool(name, { file: '/repo/server/src/foo.ts' })).toEqual({
      state: 'editing',
      line: 'правит foo.ts',
    });
    expect(tool(name)).toEqual({ state: 'editing', line: 'правит код' });
  });

  it.each([
    ['WebSearch', 'reading', 'ищет в интернете'],
    ['WebFetch', 'reading', 'читает страницу в интернете'],
    ['Task', 'thinking', 'поручает подзадачу помощнику'],
    ['Agent', 'thinking', 'поручает подзадачу помощнику'],
    ['TodoWrite', 'thinking', 'составляет план'],
    ['AskUserQuestion', 'waiting', 'ждёт ответа'],
    ['ExitPlanMode', 'waiting', 'ждёт одобрения плана'],
    ['mcp__catavasia__delegate', 'thinking', 'раздаёт задачи'],
    ['mcp__catavasia__brief', 'thinking', 'проводит планёрку'],
    ['mcp__catavasia__report', 'thinking', 'пишет отчёт'],
    ['mcp__catavasia__ask', 'waiting', 'задаёт вопрос коллеге'],
    ['mcp__catavasia__reply', 'thinking', 'отвечает коллеге'],
    ['mcp__catavasia__list_team', 'thinking', 'смотрит состав команды'],
    ['mcp__github__create_issue', 'thinking', 'пользуется внешним инструментом'],
    ['SomethingNew', 'thinking', 'работает'],
  ])('%s -> %s / %s', (name, state, line) => {
    expect(tool(name)).toEqual({ state, line });
  });

  it.each([
    ['npm test', 'testing', 'гоняет тесты'],
    ['cd server && npx vitest run', 'testing', 'гоняет тесты'],
    ['pytest -q tests/', 'testing', 'гоняет тесты'],
    ['npm run test:server', 'testing', 'гоняет тесты'],
    ['go test ./...', 'testing', 'гоняет тесты'],
    ['git commit -m "fix"', 'editing', 'коммитит'],
    ['git add -A && git commit -m x', 'editing', 'коммитит'],
    ['git -C /repo commit -m x', 'editing', 'коммитит'],
    ['git push origin main', 'editing', 'отправляет изменения'],
    ['git merge origin/main', 'editing', 'сливает ветки'],
    ['git status', 'reading', 'смотрит историю git'],
    ['gh pr create --fill', 'editing', 'оформляет пулл-реквест'],
    ['npm run lint', 'testing', 'проверяет код линтером'],
    ['npx tsc --noEmit', 'testing', 'проверяет код линтером'],
    ['npm run build', 'testing', 'собирает проект'],
    ['npm ci', 'editing', 'ставит зависимости'],
    ['ls -la', 'reading', 'изучает код'],
    ['curl https://example.com', 'editing', 'выполняет команду'],
  ])('Bash "%s" -> %s / %s', (command, state, line) => {
    expect(bash(command)).toEqual({ state, line });
  });

  it('a tool event without a tool name changes nothing', () => {
    expect(templateFor({ catId: 1, ts: 0, kind: 'tool' })).toBeNull();
  });
});

describe('narrator templates: states, messages, results', () => {
  it.each([
    ['thinking', 'thinking', 'думает'],
    ['permission', 'waiting', 'ждёт разрешения'],
    ['input', 'waiting', 'ждёт ответа'],
    ['done', 'done', 'закончил работу'],
    ['error', 'error', 'наткнулся на ошибку'],
  ])('state %s -> %s / %s', (text, state, line) => {
    expect(templateFor({ catId: 1, ts: 0, kind: 'state', text })).toEqual({ state, line });
  });

  it('an unknown state token changes nothing', () => {
    expect(templateFor({ catId: 1, ts: 0, kind: 'state', text: 'dancing' })).toBeNull();
  });

  it('a message names the receiver', () => {
    expect(templateFor({ catId: 1, ts: 0, kind: 'message', to: 'Барсик', text: 'hi' })).toEqual({
      state: 'thinking',
      line: 'пишет → Барсик',
    });
    expect(templateFor({ catId: 1, ts: 0, kind: 'message', text: 'hi' })?.line).toBe(
      'обсуждает с коллегой',
    );
  });

  it('a result is done', () => {
    expect(templateFor({ catId: 1, ts: 0, kind: 'result', text: 'ok' })).toEqual({
      state: 'done',
      line: 'сдал результат',
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
