import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AgentStateStore } from '../src/agentStateStore.js';
import { createHttpServer } from '../src/httpServer.js';
import { createWorktree, finalizeWorktree, inspectRepo } from '../src/taskBoard/gitWorktree.js';
import { parseStreamLine } from '../src/taskBoard/streamJson.js';
import { TaskManager } from '../src/taskBoard/taskManager.js';

let tmp: string;
let stateDir: string;

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

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-tasks-')));
  stateDir = path.join(tmp, 'state');
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
  it('marks tasks left running by a dead server as interrupted on start', () => {
    fs.mkdirSync(stateDir, { recursive: true });
    const orphan = { id: 'dead0001', title: 't', prompt: 't', cwd: tmp, status: 'running' };
    const tasks = { dead0001: { ...orphan, createdAt: 1, ownerPid: 2 ** 22 + 7, log: [] } };
    fs.writeFileSync(path.join(stateDir, 'tasks.json'), JSON.stringify({ version: 1, tasks }));

    const manager = new TaskManager({ stateDir });

    expect(manager.get('dead0001')).toMatchObject({ status: 'error' });
    expect(manager.get('dead0001')?.error).toContain('Interrupted');
  });
});

describe('/api/tasks', () => {
  const token = 'secret-token';

  async function startServer() {
    const manager = new TaskManager({ stateDir });
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

      const list = (await (await fetch(base)).json()) as { tasks: unknown[]; defaultCwd?: string };
      expect(list.tasks).toHaveLength(0);
      // No default folder: the server's own folder is never offered.
      expect(list.defaultCwd).toBeUndefined();
      expect((await fetch(`${base}/nope`)).status).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('rejects an empty prompt, a missing folder and a folder that does not exist', async () => {
    const { app, base, manager } = await startServer();
    try {
      expect(
        (await post(`${base}?token=${token}`, { prompt: '   ', cwd: tmp, target: 'team' })).status,
      ).toBe(400);
      // The folder is required: no fallback to the server's folder.
      expect((await post(`${base}?token=${token}`, { prompt: 'hi', target: 'team' })).status).toBe(
        400,
      );
      expect(manager.list()).toHaveLength(0);
      const missing = { prompt: 'hi', cwd: path.join(tmp, 'missing'), target: 'team' };
      expect((await post(`${base}?token=${token}`, missing)).status).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('rejects a task without a target cat or team with a clear 400', async () => {
    const { app, base, manager } = await startServer();
    try {
      const res = await post(`${base}?token=${token}`, { prompt: 'hi', cwd: tmp });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toMatch(/cat or the team/);
      expect(manager.list()).toHaveLength(0);
    } finally {
      await app.close();
    }
  });
});
