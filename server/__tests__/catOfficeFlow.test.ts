import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ServerMessage } from '../../core/src/messages.js';
import type { NarratorInput } from '../../core/src/narrator.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { createHttpServer, type HttpServerHandle } from '../src/httpServer.js';
import { ClaudeAdapter } from '../src/orchestrator/claudeAdapter.js';
import { EventLog } from '../src/orchestrator/machine/eventLog.js';
import { reduce, startTask } from '../src/orchestrator/machine/taskReducer.js';
import type { TaskState } from '../src/orchestrator/machine/types.js';
import { Orchestrator } from '../src/orchestrator/orchestrator.js';
import { TaskInputError, TaskManager } from '../src/taskBoard/taskManager.js';
import { FakeCatHost, readFakeLog, waitFor, writeFakeClaude } from './catOfficeHarness.js';

let tmp: string;
let stateDir: string;
let fakeLog: string;
let host: FakeCatHost;
let emitted: ServerMessage[];
let narrated: NarratorInput[];
let office: Orchestrator;
let tasks: TaskManager;
let server: HttpServerHandle;

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

const cat = (id: string, name: string, model: string, parentId: string | null, breed: string) => ({
  id,
  name,
  role: parentId ? 'Developer' : 'Team lead',
  systemPrompt: `I am ${name}.`,
  engine: 'claude',
  model,
  effort: 'medium',
  appearance: { breed },
  parentId,
});

async function startOffice(): Promise<void> {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, 'cats.json'),
    JSON.stringify({
      version: 1,
      cats: [
        cat('boss', 'Oliver', 'opus', null, 'marmalade'),
        cat('murka', 'Luna', 'sonnet', 'boss', 'smokey'),
        cat('pushok', 'Milo', 'sonnet', 'boss', 'snow'),
      ],
      // The Cat CEO has its own tests (catCeo*.test.ts): no judge runs here.
      catCeo: { enabled: false },
    }),
  );
  host = new FakeCatHost();
  emitted = [];
  narrated = [];
  office = new Orchestrator({
    host,
    stateDir,
    adapters: [new ClaudeAdapter(writeFakeClaude(tmp))],
    emit: (m) => emitted.push(m),
    turnConcurrency: 6,
    narrate: (input) => narrated.push(input),
  });
  server = await createHttpServer({
    embedded: true,
    token: 'tok',
    store: new AgentStateStore(),
    orchestrator: office,
  });
  office.setServerUrl(`http://127.0.0.1:${server.port}`);
  tasks = new TaskManager({ host, stateDir, flows: office });
}

async function settled(id: string) {
  return waitFor(() => {
    const task = tasks.get(id);
    return task && task.status !== 'running' ? task : undefined;
  });
}

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-office-')));
  stateDir = path.join(tmp, 'state');
  fakeLog = path.join(tmp, 'fake.log');
  process.env.FAKE_LOG = fakeLog;
  delete process.env.FAKE_MODE;
  await startOffice();
});

afterEach(async () => {
  tasks.dispose();
  await server.app.close();
  delete process.env.FAKE_MODE;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('team task (1 boss + 2 workers)', () => {
  it('delegates over MCP, merges both worker branches into task/<id>, and returns the result', async () => {
    const repo = makeRepo();
    const created = await tasks.create('make two files', repo, 'team');
    expect(created.target).toBe('team');
    const task = await settled(created.id);

    expect(task.status).toBe('done');
    expect(task.flow?.state).toBe('done');
    expect(task.result).toBe('all files are in: murka.txt, pushok.txt');
    expect(task.flow?.brief).toBe('each worker writes one file');
    expect(task.flow?.nodes.map((n) => [n.cat, n.status, n.branch])).toEqual([
      ['murka', 'reported', `task/${task.id}-murka`],
      ['pushok', 'reported', `task/${task.id}-pushok`],
    ]);

    // Worker branches exist and are merged into the task branch.
    const branches = git(repo, 'branch', '--list', `task/${task.id}*`);
    for (const b of [`task/${task.id}`, `task/${task.id}-murka`, `task/${task.id}-pushok`]) {
      expect(branches).toContain(b);
    }
    expect(git(repo, 'show', `task/${task.id}:murka.txt`)).toBe('meow from murka\n');
    expect(git(repo, 'show', `task/${task.id}:pushok.txt`)).toBe('meow from pushok\n');
    expect(task.changedFiles?.map((f) => f.path).sort()).toEqual(['murka.txt', 'pushok.txt']);
    // Every worktree is gone; only branches stay.
    expect(fs.readdirSync(path.join(stateDir, 'worktrees'))).toEqual([]);
    expect(fs.existsSync(path.join(stateDir, 'orchestrator', task.id))).toBe(false);

    // Per-turn processes: the first turn creates the session, later turns resume it.
    const runs = readFakeLog(fakeLog);
    const bossRuns = runs.filter((r) => r.cat === 'boss');
    expect(bossRuns.length).toBeGreaterThanOrEqual(2);
    const sessionId = bossRuns[0].args[bossRuns[0].args.indexOf('--session-id') + 1];
    for (const run of bossRuns.slice(1)) {
      expect(run.args[run.args.indexOf('--resume') + 1]).toBe(sessionId);
    }
    // Plain Claude Code through the SDK: user, project and local settings, the
    // office MCP server beside the user's own (no --strict-mcp-config), Auto.
    for (const flag of ['--input-format', '--mcp-config', '--setting-sources=user,project,local']) {
      expect(bossRuns[0].args).toContain(flag);
    }
    expect(bossRuns[0].args).not.toContain('--strict-mcp-config');
    expect(bossRuns[0].args[bossRuns[0].args.indexOf('--permission-mode') + 1]).toBe('auto');
    expect(bossRuns[0].persona).toContain('cat id is "boss"');
    expect(bossRuns[0].args[bossRuns[0].args.indexOf('--model') + 1]).toBe('opus');
    const murka = runs.find((r) => r.cat === 'murka')!;
    expect(murka.cwd).toBe(path.join(stateDir, 'worktrees', `${task.id}-murka`));
    expect(murka.args[murka.args.indexOf('--model') + 1]).toBe('sonnet');

    // Observable events.
    const kinds = emitted.flatMap((m) => (m.type === 'catMessage' ? [m.kind] : []));
    expect(kinds).toEqual(
      expect.arrayContaining(['task', 'brief', 'delegate', 'delegate', 'report', 'final']),
    );
    const states = emitted.flatMap((m) => (m.type === 'flowStateChanged' ? [m.state] : []));
    expect(states).toEqual(
      expect.arrayContaining(['briefing', 'delegating', 'working', 'reporting', 'merging', 'done']),
    );
    const resumed = emitted.find((m) => m.type === 'catTurnFinished' && m.cacheReadTokens);
    expect(resumed).toMatchObject({ catId: 'boss', cacheReadTokens: 9000 });
    expect(emitted.some((m) => m.type === 'queueChanged')).toBe(true);
    expect(task.costUsd).toBeGreaterThan(0);

    // One resident character per cat (spawned at start, breed palette). Each
    // turn points it at its session; at the end every member links to the task.
    // The three cats, then the CEO (always resident).
    expect(host.spawned.map((s) => s.palette)).toEqual([0, 1, 3, 4]);
    expect(new Set(host.turns.map((t) => t.id))).toEqual(new Set([1, 2, 3]));
    expect(host.ended).toHaveLength(host.turns.length);
    expect(host.linked.map((l) => l.id).sort()).toEqual([1, 2, 3]);
    expect(host.linked.every((l) => l.taskId === task.id)).toBe(true);
    expect(host.removed).toEqual([]);
    expect(task.palette).toBe(0);

    // The narrator hears tool calls, office messages and the final result.
    expect(narrated.some((n) => n.kind === 'tool' && n.tool === 'Write')).toBe(true);
    expect(narrated).toContainEqual(
      expect.objectContaining({ kind: 'message', from: 'Oliver', to: 'Luna' }),
    );
    expect(narrated.some((n) => n.kind === 'result' && n.from === 'Oliver')).toBe(true);
  });

  it('emits the phase 1 event sequence (golden list, one turn at a time)', async () => {
    // Captured from main (1.4.1-cats.12, phase 1 flowTurns.ts) with the cap at 1.
    office.scheduler.setCap(1);
    const task = await settled((await tasks.create('make two files', makeRepo(), 'team')).id);
    expect(task.status).toBe('done');
    const seq = emitted.flatMap((m) => {
      if (m.type === 'flowStateChanged') return [`state ${m.state}`];
      if (m.type === 'catMessage') return [`msg ${m.kind} ${m.from}->${m.to}`];
      if (m.type === 'catTurnStarted') return [`start ${m.catId}`];
      if (m.type === 'catTurnFinished') return [`end ${m.catId} ${m.ok}`];
      return [];
    });
    expect(seq).toEqual([
      'state briefing',
      'msg task user->boss',
      'start boss',
      'msg brief boss->team',
      'state delegating',
      'msg delegate boss->murka',
      'state working',
      'msg delegate boss->pushok',
      'end boss true',
      'start murka',
      'msg report murka->boss',
      'end murka true',
      'start pushok',
      'msg report pushok->boss',
      'end pushok true',
      'state reporting',
      'start boss',
      'msg final boss->user',
      'end boss true',
      'state merging',
      'state done',
    ]);
    // Context policy: the persona holds the prompt file sections and the office
    // rules, every turn sets the auto-compact window, and every cat starts a
    // new session in this task.
    const runs = readFakeLog(fakeLog);
    const boss = runs.find((r) => r.cat === 'boss')!;
    for (const part of [
      '# Role & conduct\n\nI am Oliver.',
      '# Rules',
      '# Lessons',
      '## Office rules',
    ]) {
      expect(boss.persona).toContain(part);
    }
    expect(runs.every((r) => r.compactWindow === '200000')).toBe(true);
    const firstTurns = runs.filter((r) => r.args.includes('--session-id'));
    expect(firstTurns.map((r) => r.cat).sort()).toEqual(['boss', 'murka', 'pushok']);
    // Replay of the event log gives the final state (§9 determinism).
    const log = EventLog.of(stateDir, task.id);
    let replayed: TaskState | undefined;
    for (const { event } of log.events()) {
      replayed =
        event.type === 'TaskStarted' ? startTask(event).state : reduce(replayed!, event).state;
    }
    expect(replayed).toEqual(log.snapshot()?.state);
    expect(replayed?.phase).toBe('done');
  });

  it('runs a single-cat task in a plain folder and reports to the user', async () => {
    const folder = path.join(tmp, 'plain');
    fs.mkdirSync(folder);
    const task = await settled((await tasks.create('write a file', folder, 'murka')).id);
    expect(task.status).toBe('done');
    expect(task.result).toBe('wrote murka.txt');
    expect(task.branch).toBeUndefined();
    expect(fs.readFileSync(path.join(folder, 'murka.txt'), 'utf-8')).toBe('meow from murka\n');
  });

  it('shows each message a cat reads in its chat without the office instructions', async () => {
    const task = await settled((await tasks.create('make two files', makeRepo(), 'team')).id);
    expect(task.status).toBe('done');
    const userRows = (catId: string) =>
      office.consoles
        .entries(catId)
        .filter((e) => e.kind === 'user')
        .map((e) => e.text);

    const boss = userRows('boss');
    expect(boss[0]).toBe('make two files');
    expect(boss).toContain('Report from Luna (murka):\nwrote murka.txt');
    expect(userRows('murka')[0]).toBe('Task from Oliver (boss):\nwrite murka.txt');
    const all = [...boss, ...userRows('murka'), ...userRows('pushok')].join('\n');
    for (const scaffold of ['[Task from', 'Steps:', 'When you are done', '[Office]', '---']) {
      expect(all).not.toContain(scaffold);
    }
  });

  it('rejects an unknown target', async () => {
    await expect(tasks.create('x', tmp, 'nobody')).rejects.toBeInstanceOf(TaskInputError);
  });

  it('lists the team and each cat as targets', () => {
    expect(tasks.targets().map((t) => t.id)).toEqual(['team', 'boss', 'murka', 'pushok']);
  });
});

describe('cat profiles over the office API', () => {
  it('broadcasts the snapshot after a change and refuses a cycle', () => {
    emitted = [];
    expect(office.editProfiles({ type: 'setCatParent', id: 'murka', parentId: 'pushok' })).toBe(
      undefined,
    );
    const loaded = emitted.find((m) => m.type === 'catProfilesLoaded');
    expect(loaded).toMatchObject({
      engineOptions: [{ engine: 'claude', models: ['fable', 'opus', 'sonnet'] }],
    });
    expect(emitted.find((m) => m.type === 'catHierarchy')).toEqual({
      type: 'catHierarchy',
      bossId: 'boss',
      children: { boss: ['pushok'], pushok: ['murka'] },
    });
    expect(
      office.editProfiles({ type: 'setCatParent', id: 'pushok', parentId: 'murka' }),
    ).toContain('one of its reports');
  });
});

describe('persistence', () => {
  it('marks a running team task interrupted when the server stops', async () => {
    process.env.FAKE_MODE = 'hang';
    const repo = makeRepo();
    const { id } = await tasks.create('hang', repo, 'team');
    await waitFor(() => (readFakeLog(fakeLog).length ? true : undefined));
    tasks.dispose();
    const onDisk = JSON.parse(fs.readFileSync(path.join(stateDir, 'tasks.json'), 'utf-8')).tasks[
      id
    ];
    expect(onDisk.status).toBe('error');
    expect(onDisk.flow.state).toBe('interrupted');
    expect(onDisk.error).toContain('Interrupted');
  });

  it('marks a team task of a dead server interrupted on restart', () => {
    const file = path.join(stateDir, 'tasks.json');
    const flow = { root: 'boss', state: 'working', nodes: [], turns: 3 };
    const stale = {
      id: 'dead',
      title: 't',
      prompt: 't',
      cwd: tmp,
      status: 'running',
      createdAt: 1,
    };
    fs.writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        tasks: { dead: { ...stale, ownerPid: 2 ** 22, log: [], flow } },
      }),
    );
    const restarted = new TaskManager({ host, stateDir, flows: office });
    expect(restarted.get('dead')?.flow?.state).toBe('interrupted');
  });
});

describe('office MCP endpoint', () => {
  it('refuses an unknown token', async () => {
    const res = await server.app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { authorization: 'Bearer nope' },
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });
    expect(res.statusCode).toBe(401);
  });
});
