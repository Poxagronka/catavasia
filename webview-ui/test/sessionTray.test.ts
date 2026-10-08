/**
 * What the CEO session's stream adds to the dock: a helper's own calls nested
 * under its row, the pinned to-do checklist, and the background task list
 * with a Stop per task.
 */

import assert from 'node:assert/strict';

import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, test, vi } from 'vitest';

import type { CatSessionEntry, TodoItem } from '../../core/src/catSession.js';
import { toRows } from '../src/catTerminal/consoleState.js';
import { ToolRow } from '../src/catTerminal/ToolActivity.js';
import { ceoDeskApi } from '../src/ceoDesk/ceoDeskApi.js';
import { pinnedTodos } from '../src/ceoDesk/dockState.js';
import { BackgroundTasks, TodoChecklist } from '../src/ceoDesk/SessionTray.js';

afterEach(() => vi.unstubAllGlobals());

const helper: CatSessionEntry = {
  kind: 'tool',
  name: 'Agent',
  text: '',
  about: 'Run echo hi and reply',
  result: 'done',
  at: 1,
};
const subCall: CatSessionEntry = { kind: 'tool', name: 'Bash', text: 'echo hi', parent: 1, at: 2 };

test("a helper's calls leave the flow and nest, closed, under the helper's row", () => {
  const rows = toRows([helper, subCall, { kind: 'text', text: 'Started a helper.', at: 3 }]);
  assert.equal(rows.length, 2);
  const tools = rows[0];
  assert.ok(tools.kind === 'tools');
  assert.deepEqual(tools.tools, [helper]);
  assert.deepEqual(tools.subs?.get(1), [subCall]);
  const html = renderToStaticMarkup(
    createElement(ToolRow, { tools: tools.tools, subs: tools.subs }),
  );
  // The helper's row opens to its calls (a closed row of their own), then its answer.
  assert.match(html, /Ran a helper/);
  assert.match(
    html,
    /data-testid="helper-calls"[^]*Ran a command[^]*data-testid="tool-result">done/,
  );
  assert.doesNotMatch(html, /<details[^>]* open/);
});

const list = (...statuses: TodoItem['status'][]): CatSessionEntry => ({
  kind: 'tool',
  name: 'TaskUpdate',
  text: '',
  todos: statuses.map((status, n) => ({
    content: `Item ${n}`,
    status,
    activeForm: `Doing item ${n}`,
  })),
});

test('the newest to-do list is pinned while an item is open; a done list goes', () => {
  const older = list('pending');
  const newer = list('completed', 'in_progress', 'pending');
  assert.equal(
    pinnedTodos([older, newer, { kind: 'text', text: 'x' }]),
    (newer as { todos: TodoItem[] }).todos,
  );
  assert.equal(pinnedTodos([older, list('completed', 'completed')]), null);
  assert.equal(pinnedTodos([{ kind: 'text', text: 'x' }]), null);
});

test('the checklist marks each item like the CLI: the open one in its own words', () => {
  const { todos } = list('completed', 'in_progress', 'pending') as { todos: TodoItem[] };
  const html = renderToStaticMarkup(createElement(TodoChecklist, { todos }));
  assert.match(html, /data-status="completed"[^>]*><span[^>]*>☒<\/span><span>Item 0</);
  assert.match(html, /line-through/);
  assert.match(html, /data-status="in_progress"[^>]*><span[^>]*>◼<\/span><span>Doing item 1</);
  assert.match(html, /data-status="pending"[^>]*><span[^>]*>☐<\/span><span>Item 2</);
});

/** Every element of a rendered tree (a component that uses no hooks, called directly). */
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}

test('each background task has its own Stop: it stops that task by its id', async () => {
  const tasks = [
    { id: 'b3a1k73m9', type: 'local_bash', description: 'Sleep for 60 seconds' },
    { id: 'ab6cd0ac8eead6895', type: 'local_agent', description: 'Run echo hi' },
  ];
  const html = renderToStaticMarkup(createElement(BackgroundTasks, { tasks, onStop: () => {} }));
  assert.match(html, /Command:[^]*Sleep for 60 seconds[^]*Stop[^]*Helper:[^]*Run echo hi[^]*Stop/);

  const stopped: string[] = [];
  const tree = BackgroundTasks({ tasks, onStop: (id) => stopped.push(id) });
  const stops = elements(tree).filter((e) => e.props['data-testid'] === 'dock-task-stop');
  (stops[1].props.onClick as () => void)();
  assert.deepEqual(stopped, ['ab6cd0ac8eead6895']);

  // The dock's Stop calls the desk route of that task.
  const fetched: Array<[string, RequestInit | undefined]> = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    fetched.push([url, init]);
    return new Response(JSON.stringify({ ok: true }));
  });
  assert.deepEqual(await ceoDeskApi.stopTask('b3a1k73m9'), { ok: true });
  assert.equal(fetched[0][0], '/api/ceo/tasks/b3a1k73m9/stop');
  assert.equal(fetched[0][1]?.method, 'POST');
});
