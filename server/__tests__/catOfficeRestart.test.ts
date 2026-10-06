/**
 * Team tasks across a server restart (task-state-machine.md §9, T13-T15):
 * the event log survives, the task waits in `interrupted`, Resume finishes
 * it, Cancel ends it. Both go through the token-gated HTTP routes.
 * Uses the fake claude of catOfficeHarness.ts.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EDIT_RIGHTS_HINT } from '../../core/src/constants.js';
import type { ServerMessage } from '../../core/src/messages.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { createHttpServer, type HttpServerHandle } from '../src/httpServer.js';
import { ClaudeAdapter } from '../src/orchestrator/claudeAdapter.js';
import { RESUME_NOTE } from '../src/orchestrator/flowPrompts.js';
import { EventLog } from '../src/orchestrator/machine/eventLog.js';
import { Orchestrator } from '../src/orchestrator/orchestrator.js';
import { TaskManager } from '../src/taskBoard/taskManager.js';
import { FakeCatHost, readFakeLog, waitFor, writeFakeClaude } from './catOfficeHarness.js';

let tmp: string;
let stateDir: string;
let repo: string;
let fakeLog: string;
let emitted: ServerMessage[];
let office: Orchestrator;
let tasks: TaskManager;
let server: HttpServerHandle;

const cat = (id: string, parentId: string | null) => ({
  id,
  name: id,
  role: 'r',
  systemPrompt: `I am ${id}.`,
  engine: 'claude',
  model: 'sonnet',
  effort: 'medium',
  appearance: {},
  parentId,
});

function git(...args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' });
}

/** One server "process": office, task board and HTTP routes on the same stateDir. */
async function boot(): Promise<void> {
  const host = new FakeCatHost();
  emitted = [];
  office = new Orchestrator({
    host,
    stateDir,
    adapters: [new ClaudeAdapter(writeFakeClaude(tmp))],
    emit: (m) => emitted.push(m),
    turnConcurrency: 6,
  });
  tasks = new TaskManager({ host, stateDir, defaultCwd: tmp, flows: office });
  server = await createHttpServer({
    embedded: true,
    token: 'tok',
    store: new AgentStateStore(),
    orchestrator: office,
    tasks,
  });
  office.setServerUrl(`http://127.0.0.1:${server.port}`);
}

async function shutdown(): Promise<void> {
  tasks.dispose();
  await server.app.close();
}

const post = (url: string, token?: string) =>
  server.app.inject({
    method: 'POST',
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

const settled = (id: string) =>
  waitFor(() => {
    const task = tasks.get(id);
    return task && task.status !== 'running' ? task : undefined;
  });

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-restart-')));
  stateDir = path.join(tmp, 'state');
  fakeLog = path.join(tmp, 'fake.log');
  process.env.FAKE_LOG = fakeLog;
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, 'cats.json'),
    JSON.stringify({
      version: 1,
      cats: [cat('boss', null), cat('murka', 'boss'), cat('pushok', 'boss')],
      // The Cat CEO has its own tests (catCeo*.test.ts): no judge runs here.
      catCeo: { enabled: false },
    }),
  );
  repo = path.join(tmp, 'repo');
  fs.mkdirSync(repo);
  git('init', '-q');
  fs.writeFileSync(path.join(repo, 'README.md'), 'hello\n');
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init');
  await boot();
});

afterEach(async () => {
  await shutdown();
  delete process.env.FAKE_HANG_CAT;
  delete process.env.FAKE_MODE;
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Start a team task where pushok hangs; stop the server once murka reported. */
async function interruptedTask(): Promise<string> {
  process.env.FAKE_HANG_CAT = 'pushok';
  const { id } = await tasks.create('make two files', repo, 'team');
  // The boss read murka's report (second boss turn) and waits for pushok.
  await waitFor(() => {
    const bossRuns = readFakeLog(fakeLog).filter((r) => r.cat === 'boss').length;
    return bossRuns >= 2 && !office.hasPendingTurn('boss') ? true : undefined;
  });
  await shutdown();
  delete process.env.FAKE_HANG_CAT;
  return id;
}

describe('restart', () => {
  it('waits in interrupted after a crash; Resume finishes the task with both branches merged', async () => {
    const id = await interruptedTask();
    const log = EventLog.of(stateDir, id);
    expect(log.load()?.state.phase).toBe('interrupted');
    // A crash writes no ServerRestarted: drop it and the snapshot, the load applies T13 itself.
    const lines = fs.readFileSync(path.join(log.dir, 'events.jsonl'), 'utf-8').trim().split('\n');
    expect(JSON.parse(lines.at(-1)!).event.type).toBe('ServerRestarted');
    fs.writeFileSync(path.join(log.dir, 'events.jsonl'), `${lines.slice(0, -1).join('\n')}\n`);
    fs.rmSync(path.join(log.dir, 'snapshot.json'));
    expect(log.load()?.state.phase).toBe('working');

    await boot();
    const before = tasks.get(id)!;
    expect(before).toMatchObject({ status: 'error', flow: { state: 'interrupted' } });
    const refused = await post(`/api/tasks/${id}/resume`);
    expect(refused.statusCode).toBe(401);
    expect(refused.json()).toEqual({ error: EDIT_RIGHTS_HINT });
    const resumed = await post(`/api/tasks/${id}/resume`, 'tok');
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json()).toMatchObject({ status: 'running', flow: { state: 'working' } });
    const task = await settled(id);
    expect(task).toMatchObject({
      status: 'done',
      result: 'all files are in: murka.txt, pushok.txt',
    });
    expect(git('show', `task/${id}:murka.txt`)).toBe('meow from murka\n');
    expect(git('show', `task/${id}:pushok.txt`)).toBe('meow from pushok\n');

    const runs = readFakeLog(fakeLog);
    const pushok = runs.filter((r) => r.cat === 'pushok');
    expect(pushok.at(-1)!.message.startsWith(RESUME_NOTE)).toBe(true);
    // pushok never finished a turn: a new session. The boss resumes its own.
    const sessionOf = (args: string[]) =>
      args[args.indexOf(args.includes('--resume') ? '--resume' : '--session-id') + 1];
    expect(sessionOf(pushok.at(-1)!.args)).not.toBe(sessionOf(pushok[0].args));
    const boss = runs.filter((r) => r.cat === 'boss');
    expect(boss.at(-1)!.args).toContain('--resume');
    expect(sessionOf(boss.at(-1)!.args)).toBe(sessionOf(boss[0].args));
    const states = emitted.flatMap((m) => (m.type === 'flowStateChanged' ? [m.state] : []));
    expect(states).toEqual(['interrupted', 'working', 'reporting', 'merging', 'done']);
  });

  it('cancels an interrupted task: the worktrees go, the branches stay', async () => {
    const id = await interruptedTask();
    await boot();
    const reply = await post(`/api/tasks/${id}/cancel`, 'tok');
    expect(reply.statusCode).toBe(200);
    const task = await waitFor(() =>
      tasks.get(id)?.flow?.state === 'cancelled' ? tasks.get(id) : undefined,
    );
    expect(task).toMatchObject({ status: 'error', error: 'Cancelled by the user.' });
    expect(fs.readdirSync(path.join(stateDir, 'worktrees'))).toEqual([]);
    expect(git('branch', '--list', `task/${id}*`)).toContain(`task/${id}-murka`);
    expect((await post(`/api/tasks/${id}/resume`, 'tok')).statusCode).toBe(409);
  });

  it('cancels a running task and refuses to resume a running one', async () => {
    process.env.FAKE_MODE = 'hang';
    const { id } = await tasks.create('hang', repo, 'team');
    await waitFor(() => (readFakeLog(fakeLog).length ? true : undefined));
    expect((await post(`/api/tasks/${id}/resume`, 'tok')).statusCode).toBe(409);
    expect((await post(`/api/tasks/${id}/cancel`)).statusCode).toBe(401);
    expect((await post(`/api/tasks/${id}/cancel`, 'tok')).statusCode).toBe(200);
    const task = await settled(id);
    expect(task).toMatchObject({ flow: { state: 'cancelled' }, error: 'Cancelled by the user.' });
    expect((await post('/api/tasks/nope/cancel', 'tok')).statusCode).toBe(404);
  });
});
