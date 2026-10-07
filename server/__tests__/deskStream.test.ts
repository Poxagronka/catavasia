import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CatSessionEntry, ContextUse } from '../../core/src/catSession.js';
import type { DeskRow } from '../src/ceoDesk/deskStore.js';
import { DeskStream, TOOL_RESULT_MAX_CHARS, type ToolImage } from '../src/ceoDesk/deskStream.js';
import { relativePaths } from '../src/taskBoard/streamJson.js';
import {
  backgroundTasks,
  imageBlock,
  init,
  RED_PNG,
  result,
  subText,
  subToolUse,
  system,
  text,
  textDelta,
  textStart,
  thinking,
  toolResult,
  toolUse,
} from './fixtures/sdkLines.js';

const PROJECT = '/Users/me/site';

function harness(last?: ContextUse) {
  const rows: DeskRow[] = [];
  const contexts: ContextUse[] = [];
  const saved: ToolImage[][] = [];
  const drafts: string[] = [];
  let at = 0;
  let statuses = 0;
  const stream = new DeskStream(
    {
      add: (entry: CatSessionEntry) => {
        const row = { ...entry, at: ++at } as DeskRow;
        rows.push(row);
        return row;
      },
      update: (row) => {
        rows[rows.findIndex((r) => r.at === row.at)] = row;
      },
      saveImages: (images) => {
        saved.push(images);
        return images.map((_, n) => ({
          name: 'picture',
          size: 75,
          image: true,
          url: `/api/ceo/attachments/c-1/${n}-picture.png`,
        }));
      },
      context: (use) => contexts.push(use),
      draft: (t) => drafts.push(t),
      folders: [PROJECT],
      status: () => statuses++,
    },
    last,
  );
  return { stream, rows, contexts, saved, drafts, statuses: () => statuses };
}

describe('desk stream rows', () => {
  it('a turn that reads a PNG: thought, tool row with the picture, held reply, context', () => {
    const { stream, rows, contexts, saved } = harness();
    for (const l of [
      init(),
      thinking(2848),
      toolUse('t1', 'Read', { file_path: `${PROJECT}/red.png` }),
      toolResult('t1', [imageBlock()]),
      text('Red.'),
      result(),
    ])
      stream.line(l);
    expect(rows).toMatchObject([
      { kind: 'thought', ms: 2848 },
      {
        kind: 'tool',
        name: 'Read',
        text: 'red.png',
        images: [{ url: '/api/ceo/attachments/c-1/0-picture.png' }],
      },
    ]);
    expect(saved).toEqual([[{ mediaType: 'image/png', data: RED_PNG }]]);
    // The reply waits: the turn's final text replaces it.
    expect(stream.held).toBe('Red.');
    expect(contexts.at(-1)).toEqual({ used: 20909, window: 200000 });
  });

  it('keeps the full input and a cut result; an error marks the row', () => {
    const { stream, rows } = harness();
    stream.line(toolUse('t1', 'Bash', { command: `ls ${PROJECT}/src`, description: 'List' }));
    stream.line(toolResult('t2', 'unknown id'));
    stream.line(toolResult('t1', 'x'.repeat(TOOL_RESULT_MAX_CHARS + 50), true));
    expect(rows).toHaveLength(1);
    const row = rows[0] as Extract<DeskRow, { kind: 'tool' }>;
    // The description is the call's plain line; the command its detail.
    expect(row).toMatchObject({ text: 'ls src', about: 'List' });
    expect(row.input).toBeUndefined();
    expect(row.result).toHaveLength(TOOL_RESULT_MAX_CHARS + 1);
    expect(row.isError).toBe(true);
  });

  it('text before a tool goes first; desk tools and helper threads add no rows', () => {
    const { stream, rows } = harness();
    stream.line(text('Let me look.'));
    stream.line(toolUse('d1', 'mcp__desk__start_job', { task: 'x' }));
    stream.line(toolResult('h1', 'from a helper', false, 'toolu_parent'));
    stream.line(text('Done.'));
    expect(rows).toMatchObject([{ kind: 'text', text: 'Let me look.' }]);
    expect(stream.held).toBe('Done.');
  });

  it('the window is the model window the result reports, uncapped', () => {
    const { stream, contexts } = harness({ used: 5, window: 150000 });
    stream.line(init('claude-opus-x'));
    stream.line(text('hi'));
    expect(contexts.at(-1)).toEqual({ used: 20909, window: 150000 });
    stream.line(result(1000000, 'claude-opus-x'));
    expect(contexts.at(-1)).toEqual({ used: 20909, window: 1000000 });
  });
});

describe('live reply text', () => {
  afterEach(() => vi.useRealTimers());

  it('sends the growing text at most every 50 ms, then the whole block', () => {
    vi.useFakeTimers({ now: 1000 });
    const { stream, rows, drafts } = harness();
    stream.line(textStart());
    stream.line(textDelta('Hel'));
    stream.line(textDelta('lo'));
    vi.advanceTimersByTime(60);
    stream.line(textDelta(' wor'));
    expect(drafts).toEqual(['Hel', 'Hello wor']);
    // The finished block carries the whole text, even the deltas the throttle held back.
    stream.line(text('Hello world.'));
    expect(drafts.at(-1)).toBe('Hello world.');
    expect(rows).toEqual([]);
    expect(stream.held).toBe('Hello world.');
  });

  it('a new text block puts the previous text in its row first; helpers stream nothing', () => {
    const { stream, rows, drafts } = harness();
    stream.line(textStart());
    stream.line(textDelta('One.'));
    stream.line(text('One.'));
    stream.line(textStart());
    expect(rows).toMatchObject([{ kind: 'text', text: 'One.' }]);
    stream.line(textDelta('from a helper', 'toolu_parent'));
    expect(drafts).toEqual(['One.', 'One.']);
  });

  it('without partial messages the reply only waits (no draft)', () => {
    const { stream, drafts } = harness();
    stream.line(text('Red.'));
    expect(drafts).toEqual([]);
  });
});

/** The Agent call of the CLI 2.1.293 probe: it runs in the background. */
const AGENT = 'toolu_agent';
const LAUNCHED =
  'Async agent launched successfully. (This tool result is internal metadata for the model.)';

describe('helpers (sub-agents)', () => {
  const launch = () =>
    toolUse(AGENT, 'Agent', {
      description: 'Run echo hi and reply',
      prompt: 'Run echo hi. Then reply done.',
      subagent_type: 'general-purpose',
    });

  it("a background helper's calls nest under its row; its text becomes the row's result", () => {
    const { stream, rows } = harness();
    stream.line(launch());
    stream.line(toolResult(AGENT, [{ type: 'text', text: LAUNCHED }]));
    stream.line(subToolUse(AGENT, 'toolu_sub', 'Bash', { command: `ls ${PROJECT}/src` }));
    stream.line(toolResult('toolu_sub', 'a.ts', false, AGENT));
    stream.line(subText(AGENT, 'done'));
    expect(rows).toMatchObject([
      { kind: 'tool', name: 'Agent', about: 'Run echo hi and reply', result: 'done', at: 1 },
      { kind: 'tool', name: 'Bash', text: 'ls src', result: 'a.ts', parent: 1 },
    ]);
    // The helper's thread is not the CEO's reply, nor its context.
    expect(stream.held).toBeUndefined();
  });

  it("a helper's answer that came first stays: the tool result does not replace it", () => {
    const { stream, rows } = harness();
    stream.line(launch());
    stream.line(subText(AGENT, 'done'));
    stream.line(toolResult(AGENT, 'done\nagentId: a1'));
    expect(rows).toMatchObject([{ name: 'Agent', result: 'done' }]);
  });

  it("a helper's helper stays one level deep; an unknown parent adds nothing", () => {
    const { stream, rows } = harness();
    stream.line(launch());
    stream.line(subToolUse(AGENT, 'toolu_inner', 'Agent', { prompt: 'deeper' }));
    stream.line(subToolUse('toolu_inner', 'toolu_deep', 'Bash', { command: 'ls' }));
    stream.line(subToolUse('toolu_unknown', 'toolu_x', 'Bash', { command: 'ls' }));
    expect(rows.map((r) => (r.kind === 'tool' ? [r.name, r.parent] : r.kind))).toEqual([
      ['Agent', undefined],
      ['Agent', 1],
    ]);
  });
});

describe('to-do list', () => {
  it('TodoWrite sends the whole list: its row carries it after the result', () => {
    const { stream, rows } = harness();
    const todos = [
      { content: 'Read the file', status: 'in_progress', activeForm: 'Reading the file' },
      { content: 'Answer', status: 'pending', activeForm: 'Answering' },
    ];
    stream.line(toolUse('w1', 'TodoWrite', { todos }));
    expect(rows[0]).not.toHaveProperty('todos');
    stream.line(toolResult('w1', 'Todos have been modified successfully.'));
    expect(rows[0]).toMatchObject({ todos });
  });

  it('TaskCreate adds an item by the id its result names; TaskUpdate changes or deletes it', () => {
    const { stream, rows } = harness();
    stream.line(
      toolUse('c1', 'TaskCreate', { subject: 'Read', description: 'd', activeForm: 'Reading' }),
    );
    stream.line(toolResult('c1', 'Task #1 created successfully: Read'));
    stream.line(toolUse('c2', 'TaskCreate', { subject: 'Answer', description: 'd' }));
    stream.line(toolResult('c2', 'Task #2 created successfully: Answer'));
    stream.line(toolUse('u1', 'TaskUpdate', { taskId: '1', status: 'completed' }));
    stream.line(toolResult('u1', 'Updated task #1 status'));
    expect(rows.at(-1)).toMatchObject({
      todos: [
        { id: '1', content: 'Read', status: 'completed', activeForm: 'Reading' },
        { id: '2', content: 'Answer', status: 'pending' },
      ],
    });
    stream.line(toolUse('u2', 'TaskUpdate', { taskId: '2', status: 'deleted' }));
    stream.line(toolResult('u2', 'Updated task #2 deleted'));
    expect(rows.at(-1)).toMatchObject({ todos: [{ id: '1' }] });
    // A failed call leaves the list as it was.
    stream.line(toolUse('u3', 'TaskUpdate', { taskId: '1', status: 'pending' }));
    stream.line(toolResult('u3', 'No such task', true));
    expect(rows.at(-1)).not.toHaveProperty('todos');
    expect(stream.todos).toMatchObject([{ id: '1', status: 'completed' }]);
  });
});

describe('background tasks', () => {
  it('each change replaces the list; ambient watchers are left out; Stop keeps it live', () => {
    const { stream, statuses } = harness();
    stream.line(
      backgroundTasks([
        { task_id: 'b3a1k73m9', task_type: 'local_bash', description: 'Sleep for 60 seconds' },
        { task_id: 'w1', task_type: 'monitor', description: 'Watch', ambient: true },
      ]),
    );
    expect(stream.tasks).toEqual([
      { id: 'b3a1k73m9', type: 'local_bash', description: 'Sleep for 60 seconds' },
    ]);
    expect(statuses()).toBe(1);
    // After Stop the stream is quiet, but the task list still follows the session.
    stream.line(backgroundTasks([]), true);
    stream.line(text('ignored'), true);
    expect(stream.tasks).toEqual([]);
    expect(stream.held).toBeUndefined();
  });
});

describe('system messages', () => {
  it('a retry shows "Retrying (n)…" until Claude writes again', () => {
    const { stream, rows } = harness();
    stream.line(
      system('api_retry', {
        attempt: 2,
        max_retries: 10,
        retry_delay_ms: 1200,
        error_status: 529,
        error: 'server_error',
      }),
    );
    expect(stream.notice).toBe('Retrying (2)…');
    stream.line(textStart());
    expect(stream.notice).toBeUndefined();
    expect(rows).toEqual([]);
  });

  it('compacting, a notification and a rejected limit are passing states; the result ends them', () => {
    const { stream } = harness();
    stream.line(system('status', { status: 'compacting' }));
    expect(stream.notice).toBe('Summarising the chat…');
    stream.line(system('status', { status: null }));
    expect(stream.notice).toBeUndefined();
    stream.line(system('notification', { key: 'k', text: 'Update ready', priority: 'low' }));
    expect(stream.notice).toBe('Update ready');
    stream.line(
      JSON.stringify({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected' } }),
    );
    expect(stream.notice).toBe('Usage limit reached');
    stream.line(result());
    expect(stream.notice).toBeUndefined();
  });

  it('a denial and a failed hook are quiet notes; a hook that worked adds nothing', () => {
    const { stream, rows } = harness();
    stream.line(
      system('permission_denied', {
        tool_name: 'Bash',
        tool_use_id: 't1',
        message: 'Read only mode',
      }),
    );
    const hook = { hook_id: 'h', hook_name: 'PreToolUse:Bash', hook_event: 'PreToolUse' };
    stream.line(system('hook_started', hook));
    stream.line(
      system('hook_response', {
        ...hook,
        output: '{}',
        stdout: '{}',
        stderr: '',
        exit_code: 0,
        outcome: 'success',
      }),
    );
    stream.line(
      system('hook_response', {
        ...hook,
        output: '',
        stdout: '',
        stderr: 'blocked: rm',
        exit_code: 2,
        outcome: 'error',
      }),
    );
    expect(rows).toMatchObject([
      { kind: 'note', text: 'Not allowed: Bash (Read only mode)' },
      { kind: 'note', text: 'Hook PreToolUse:Bash failed: blocked: rm' },
    ]);
  });

  it('a failed Stop hook after the final text keeps the reply held (no second copy)', () => {
    const { stream, rows } = harness();
    stream.line(text('All done.'));
    const hook = { hook_id: 'h', hook_name: 'Stop', hook_event: 'Stop' };
    stream.line(system('hook_response', { ...hook, stderr: 'lint failed', outcome: 'error' }));
    expect(rows).toMatchObject([{ kind: 'note', text: 'Hook Stop failed: lint failed' }]);
    expect(stream.held).toBe('All done.');
  });

  it("Stop's quiet stream still ends the notice at the result; a helper's output ends it too", () => {
    const { stream } = harness();
    stream.line(system('api_retry', { attempt: 1 }));
    stream.line(result(), true);
    expect(stream.notice).toBeUndefined();
    stream.line(toolUse(AGENT, 'Agent', { prompt: 'x' }));
    stream.line(system('api_retry', { attempt: 3 }));
    stream.line(subToolUse(AGENT, 'toolu_s', 'Bash', { command: 'ls' }));
    expect(stream.notice).toBeUndefined();
  });

  it("a local command's output shows like a reply", () => {
    const { stream, rows } = harness();
    stream.line(system('local_command_output', { content: 'Version 2.1.293\n- New things' }));
    expect(stream.held).toBe('Version 2.1.293\n- New things');
    expect(rows).toEqual([]);
  });
});

describe('relative paths', () => {
  it('drops the project folder and shows the home folder as ~', () => {
    expect(
      relativePaths(
        `cat ${PROJECT}/a.ts /Users/me/x; ls ${PROJECT} ${PROJECT}-old`,
        [PROJECT],
        '/Users/me',
      ),
    ).toBe('cat a.ts ~/x; ls site ~/site-old');
    expect(relativePaths('C:\\p\\a.ts', ['C:\\p'], undefined)).toBe('a.ts');
    expect(relativePaths('/private/var/t/a.png', ['/var/t', '/private/var/t'], undefined)).toBe(
      'a.png',
    );
  });
});
