import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { NarratorInput } from '../../core/src/narrator.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { createHttpServer } from '../src/httpServer.js';
import { createWorktree, finalizeWorktree, inspectRepo } from '../src/taskBoard/gitWorktree.js';
import { parseStreamLine } from '../src/taskBoard/streamJson.js';
import { type TaskAgentHost, TaskManager } from '../src/taskBoard/taskManager.js';

/** Stand-in for `claude -p`: echoes the prompt into a file in its cwd, prints
 *  stream-json, and fails when the prompt says FAIL. */
const FAKE_CLAUDE = `#!/usr/bin/env node
let prompt = '';
process.stdin.on('data', (d) => (prompt += d));
process.stdin.on('end', () => {
  const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
  if (prompt.includes('FAIL')) {
    process.stderr.write('boom: something broke');
    process.exit(3);
  }
  require('fs').writeFileSync('meow.txt', prompt);
  out({ type: 'system', subtype: 'init', cwd: process.cwd() });
  out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Write', input: { file_path: 'meow.txt' } }] } });
  out({ type: 'assistant', message: { content: [{ type: 'text', text: 'Created **meow.txt**' }] } });
  out({ type: 'result', subtype: 'success', is_error: false, result: 'Done: meow.txt', total_cost_usd: 0.01, duration_ms: 42, num_turns: 2, args: process.argv.slice(2) });
});
`;

let tmp: string;
let stateDir: string;
let fakeBin: string;

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf-8' });
}

function makeRepo(): string {
  const repo = path.join(tmp, 'repo');
  fs.mkdirSync(repo);
  git(repo, 'init', '-q');
  fs.writeFileSync(path.join(repo, 'README.md'), 'hello\n');
  git(repo, 'add', '-A');
  git(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init');
  return repo;
}

class FakeHost implements TaskAgentHost {
  launched: Array<{ sessionId: string; cwd: string }> = [];
  finished: number[] = [];
  finishedTasks: string[] = [];
  launchHeadlessAgent(sessionId: string, cwd: string) {
    this.launched.push({ sessionId, cwd });
    return { id: this.launched.length, palette: 4, hueShift: 0 };
  }
  finishHeadlessAgent(id: number, taskId: string) {
    this.finished.push(id);
    this.finishedTasks.push(taskId);
  }
  resumeHeadlessAgent() {}
  restored: Array<{ sessionId: string; taskId: string; palette?: number }> = [];
  restoreFinishedAgent(
    sessionId: string,
    _cwd: string,
    taskId: string,
    look?: { palette?: number },
  ) {
    this.restored.push({ sessionId, taskId, palette: look?.palette });
    return { id: 100 + this.restored.length };
  }
}

async function waitSettled(manager: TaskManager, id: string) {
  for (let i = 0; i < 200; i++) {
    const task = manager.get(id);
    if (task && task.status !== 'running') return task;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('task never settled');
}

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-tasks-')));
  stateDir = path.join(tmp, 'state');
  fakeBin = path.join(tmp, 'fake-claude');
  fs.writeFileSync(fakeBin, FAKE_CLAUDE, { mode: 0o755 });
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('gitWorktree', () => {
  it('creates a worktree, commits its changes, removes it and keeps the branch', async () => {
    const repo = makeRepo();
    const info = (await inspectRepo(repo))!;
    expect(info.subdir).toBe('');
    const wt = path.join(tmp, 'wt');
    await createWorktree(info, wt, 'task/abc');
    fs.writeFileSync(path.join(wt, 'new.txt'), 'meow\n');
    fs.writeFileSync(path.join(wt, 'README.md'), 'changed\n');

    const outcome = await finalizeWorktree(info.root, wt, info.head, 'task abc');

    expect(outcome.changedFiles).toEqual([
      { status: 'M', path: 'README.md' },
      { status: 'A', path: 'new.txt' },
    ]);
    expect(outcome.diff).toContain('+meow');
    expect(fs.existsSync(wt)).toBe(false);
    expect(git(repo, 'branch', '--list', 'task/abc')).toContain('task/abc');
    expect(git(repo, 'log', '-1', '--format=%s', 'task/abc').trim()).toBe('task abc');
  });

  it('carries untracked and ignored project settings into the worktree and never commits them', async () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, '.gitignore'), '.claude/settings.local.json\n');
    git(repo, 'add', '.gitignore');
    git(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'ignore');
    const local = {
      'CLAUDE.local.md': 'local rules\n',
      '.mcp.json': '{"mcpServers":{}}\n',
      '.claude/settings.local.json': '{}\n',
      '.claude/skills/probe/SKILL.md': 'skill\n',
    };
    for (const [name, text] of Object.entries(local)) {
      fs.mkdirSync(path.dirname(path.join(repo, name)), { recursive: true });
      fs.writeFileSync(path.join(repo, name), text);
    }
    fs.mkdirSync(path.join(tmp, 'shared-skill'));
    fs.writeFileSync(path.join(tmp, 'shared-skill', 'SKILL.md'), 'linked\n');
    fs.symlinkSync(path.join(tmp, 'shared-skill'), path.join(repo, '.claude/skills/linked'));
    const statusBefore = git(repo, 'status', '--porcelain');
    const info = (await inspectRepo(repo))!;
    const wt = path.join(tmp, 'wt');
    await createWorktree(info, wt, 'task/ctx');
    for (const [name, text] of Object.entries(local)) {
      expect(fs.readFileSync(path.join(wt, name), 'utf-8')).toBe(text);
    }
    expect(fs.readFileSync(path.join(wt, '.claude/skills/linked/SKILL.md'), 'utf-8')).toBe(
      'linked\n',
    );
    fs.writeFileSync(path.join(wt, 'new.txt'), 'meow\n');

    const outcome = await finalizeWorktree(info.root, wt, info.head, 'task ctx');

    expect(outcome.changedFiles).toEqual([{ status: 'A', path: 'new.txt' }]);
    expect(git(repo, 'status', '--porcelain')).toBe(statusBefore);
  });

  it('returns null for a folder outside any git repo', async () => {
    expect(await inspectRepo(tmp)).toBeNull();
  });
});

describe('parseStreamLine', () => {
  it('marks a result that stopped at --max-budget-usd (shape of claude 2.1.x)', () => {
    const parsed = parseStreamLine(
      JSON.stringify({
        type: 'result',
        subtype: 'error_max_budget_usd',
        is_error: true,
        errors: ['Reached maximum budget ($0.0001)'],
        total_cost_usd: 0.049,
      }),
    );
    expect(parsed.result).toMatchObject({ isError: true, budgetHit: true });
  });

  it('flags an is_error result even when subtype is success', () => {
    const parsed = parseStreamLine(
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: true,
        result: 'Not logged in',
      }),
    );
    expect(parsed.result).toMatchObject({ isError: true, text: 'Not logged in' });
  });

  it('summarizes a NotebookEdit by its notebook path', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'NotebookEdit',
            input: { notebook_path: '/r/x.ipynb', new_source: 'a' },
          },
        ],
      },
    });
    expect(parseStreamLine(line).log).toEqual([
      { kind: 'tool', name: 'NotebookEdit', text: '/r/x.ipynb' },
    ]);
  });

  it('ignores non-JSON lines', () => {
    expect(parseStreamLine('not json')).toEqual({ log: [] });
  });
});

describe('TaskManager', () => {
  it('runs a task in a worktree and records result, diff and branch', async () => {
    const repo = makeRepo();
    const host = new FakeHost();
    const manager = new TaskManager({ host, stateDir, claudeBin: fakeBin });

    const created = await manager.create('create meow.txt\nwith the word meow', repo);
    expect(created).toMatchObject({ status: 'running', title: 'create meow.txt', palette: 4 });
    const task = await waitSettled(manager, created.id);

    expect(task.status).toBe('done');
    expect(task.result).toBe('Done: meow.txt');
    expect(task.costUsd).toBe(0.01);
    expect(task.branch).toBe(`task/${created.id}`);
    expect(task.changedFiles).toEqual([{ status: 'A', path: 'meow.txt' }]);
    expect(task.diff).toContain('+create meow.txt');
    expect(task.log.map((e) => e.kind)).toEqual(['tool', 'text']);
    // The agent ran inside the worktree, which is gone now; the main checkout is untouched.
    const wt = path.join(stateDir, 'worktrees', created.id);
    expect(host.launched[0].cwd).toBe(wt);
    expect(fs.existsSync(wt)).toBe(false);
    expect(fs.existsSync(path.join(repo, 'meow.txt'))).toBe(false);
    expect(git(repo, 'show', `task/${created.id}:meow.txt`)).toContain('with the word meow');
    expect(host.finished).toEqual([1]);
    expect(host.finishedTasks).toEqual([created.id]);
    // Persisted for the next server start.
    const stored = JSON.parse(fs.readFileSync(path.join(stateDir, 'tasks.json'), 'utf-8'));
    expect(stored.tasks[created.id].status).toBe('done');
  });

  it('runs directly in a folder that is not a git repo', async () => {
    const folder = path.join(tmp, 'plain');
    fs.mkdirSync(folder);
    const host = new FakeHost();
    const narrated: NarratorInput[] = [];
    const manager = new TaskManager({
      host,
      stateDir,
      claudeBin: fakeBin,
      narrate: (input) => narrated.push(input),
    });

    const task = await waitSettled(manager, (await manager.create('hello', folder)).id);

    expect(task.status).toBe('done');
    expect(task.branch).toBeUndefined();
    // The stream feeds the narrator: tool, assistant text, final result.
    expect(narrated.map(({ ts: _ts, ...rest }) => rest)).toEqual([
      { catId: 1, kind: 'tool', tool: 'Write', file: 'meow.txt', text: 'meow.txt' },
      { catId: 1, kind: 'state', text: 'thinking' },
      { catId: 1, kind: 'result', text: 'Done: meow.txt' },
    ]);
    expect(host.launched[0].cwd).toBe(folder);
    expect(fs.readFileSync(path.join(folder, 'meow.txt'), 'utf-8')).toBe('hello');
  });

  it('marks a failing run as error with the stderr tail', async () => {
    const host = new FakeHost();
    const manager = new TaskManager({ host, stateDir, claudeBin: fakeBin });

    const task = await waitSettled(manager, (await manager.create('please FAIL', tmp)).id);

    expect(task.status).toBe('error');
    expect(task.error).toContain('Exit code 3');
    expect(task.error).toContain('boom: something broke');
    expect(host.finished).toEqual([1]);
  });

  it('marks a missing CLI binary as error', async () => {
    const manager = new TaskManager({
      host: new FakeHost(),
      stateDir,
      claudeBin: path.join(tmp, 'no-such-claude'),
    });
    const task = await waitSettled(manager, (await manager.create('hi', tmp)).id);
    expect(task.status).toBe('error');
    expect(task.error).toContain('ENOENT');
  });

  it('marks tasks left running by a dead server as interrupted on start', () => {
    fs.mkdirSync(stateDir, { recursive: true });
    const orphan = { id: 'dead0001', title: 't', prompt: 't', cwd: tmp, status: 'running' };
    const tasks = { dead0001: { ...orphan, createdAt: 1, ownerPid: 2 ** 22 + 7, log: [] } };
    fs.writeFileSync(path.join(stateDir, 'tasks.json'), JSON.stringify({ version: 1, tasks }));

    const manager = new TaskManager({ host: new FakeHost(), stateDir });

    expect(manager.get('dead0001')).toMatchObject({ status: 'error' });
    expect(manager.get('dead0001')?.error).toContain('Interrupted');
  });

  it('gives the newest finished one-cat runs their idle cat back after a restart', () => {
    fs.mkdirSync(stateDir, { recursive: true });
    const dead = 2 ** 22 + 7;
    const run = (id: string, finishedAt: number, extra: object = {}) => ({
      id,
      title: id,
      prompt: id,
      cwd: tmp,
      status: 'done',
      createdAt: finishedAt - 1,
      finishedAt,
      ownerPid: dead,
      log: [],
      sessionId: `s-${id}`,
      agentCwd: tmp,
      agentId: 3,
      palette: 5,
      hueShift: 0,
      ...extra,
    });
    const list = [
      ...Array.from({ length: 7 }, (_, i) => run(`old${i}`, 100 + i)),
      run('team1', 500, { target: 'team' }),
      run('nosess', 600, { sessionId: undefined }),
      run('live', 700, { ownerPid: process.ppid }),
    ];
    const tasks = Object.fromEntries(list.map((t) => [t.id, t]));
    fs.writeFileSync(path.join(stateDir, 'tasks.json'), JSON.stringify({ version: 1, tasks }));
    const host = new FakeHost();
    const manager = new TaskManager({ host, stateDir });

    manager.restoreFinishedCats();

    // Newest first, at most 6; team tasks, runs without a session and tasks a
    // live server owns are skipped.
    expect(host.restored.map((r) => r.taskId)).toEqual([
      'old6',
      'old5',
      'old4',
      'old3',
      'old2',
      'old1',
    ]);
    expect(host.restored[0]).toEqual({ sessionId: 's-old6', taskId: 'old6', palette: 5 });
    // Clicking the restored cat (new agent id) opens its task.
    expect(manager.findByAgent(101)?.id).toBe('old6');
    expect(manager.resumeBlocker('old6')).toBeUndefined();
  });
});

describe('/api/tasks', () => {
  const token = 'secret-token';

  async function startServer() {
    const manager = new TaskManager({
      host: new FakeHost(),
      stateDir,
      claudeBin: fakeBin,
    });
    const { app, port } = await createHttpServer({
      embedded: true,
      token,
      store: new AgentStateStore(),
      tasks: manager,
    });
    return { app, base: `http://127.0.0.1:${port}/api/tasks`, manager };
  }

  const post = (url: string, body: unknown) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('requires the session token to create a task but not to read the board', async () => {
    const { app, base, manager } = await startServer();
    try {
      expect((await post(base, { prompt: 'hi', cwd: tmp })).status).toBe(401);
      expect((await post(`${base}?token=wrong`, { prompt: 'hi', cwd: tmp })).status).toBe(401);
      expect(manager.list()).toHaveLength(0);

      const res = await post(`${base}?token=${token}`, { prompt: 'hi', cwd: tmp });
      expect(res.status).toBe(201);
      const created = (await res.json()) as { id: string };
      await waitSettled(manager, created.id);

      const list = (await (await fetch(base)).json()) as { tasks: unknown[]; defaultCwd?: string };
      expect(list.tasks).toHaveLength(1);
      // No default folder: the server's own folder is never offered.
      expect(list.defaultCwd).toBeUndefined();
      const detail = (await (await fetch(`${base}/${created.id}`)).json()) as { log: unknown[] };
      expect(detail.log.length).toBeGreaterThan(0);
      expect((await fetch(`${base}/nope`)).status).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('rejects an empty prompt, a missing folder and a folder that does not exist', async () => {
    const { app, base, manager } = await startServer();
    try {
      expect((await post(`${base}?token=${token}`, { prompt: '   ', cwd: tmp })).status).toBe(400);
      // The folder is required: no fallback to the server's folder.
      expect((await post(`${base}?token=${token}`, { prompt: 'hi' })).status).toBe(400);
      expect(manager.list()).toHaveLength(0);
      const missing = { prompt: 'hi', cwd: path.join(tmp, 'missing') };
      expect((await post(`${base}?token=${token}`, missing)).status).toBe(400);
    } finally {
      await app.close();
    }
  });
});
