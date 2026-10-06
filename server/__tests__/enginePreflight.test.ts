/**
 * Engine preflight: a task whose engine is logged out fails at once, before
 * any turn; an auth error during a turn stops the task with no retry and one
 * actionable message. Over the fake `claude` of catOfficeHarness.ts
 * (FAKE_MODE=loggedout / authfail).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ServerMessage } from '../../core/src/messages.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { createHttpServer, type HttpServerHandle } from '../src/httpServer.js';
import { ClaudeAdapter } from '../src/orchestrator/claudeAdapter.js';
import { Orchestrator } from '../src/orchestrator/orchestrator.js';
import { TaskManager } from '../src/taskBoard/taskManager.js';
import { FakeCatHost, readFakeLog, waitFor, writeFakeClaude } from './catOfficeHarness.js';

let tmp: string;
let stateDir: string;
let fakeLog: string;
let emitted: ServerMessage[];
let office: Orchestrator;
let tasks: TaskManager;
let server: HttpServerHandle;

const cat = (id: string, name: string, parentId: string | null) => ({
  id,
  name,
  role: parentId ? 'Developer' : 'Team lead',
  systemPrompt: `I am ${name}.`,
  engine: 'claude',
  model: 'opus',
  effort: 'medium',
  appearance: { breed: 'marmalade' },
  parentId,
});

async function startOffice(mode: string): Promise<void> {
  process.env.FAKE_MODE = mode;
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, 'cats.json'),
    JSON.stringify({
      version: 1,
      cats: [cat('boss', 'Oliver', null), cat('murka', 'Luna', 'boss')],
      catCeo: { enabled: false },
    }),
  );
  const host = new FakeCatHost();
  emitted = [];
  office = new Orchestrator({
    host,
    stateDir,
    adapters: [new ClaudeAdapter(writeFakeClaude(tmp))],
    emit: (m) => emitted.push(m),
    turnConcurrency: 6,
  });
  server = await createHttpServer({
    embedded: true,
    token: 'tok',
    store: new AgentStateStore(),
    orchestrator: office,
  });
  office.setServerUrl(`http://127.0.0.1:${server.port}`);
  tasks = new TaskManager({ host, stateDir, flows: office });
  await office.checkEngines();
}

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-preflight-')));
  stateDir = path.join(tmp, 'state');
  fakeLog = path.join(tmp, 'fake.log');
  process.env.FAKE_LOG = fakeLog;
});

afterEach(async () => {
  tasks.dispose();
  await server.app.close();
  delete process.env.FAKE_MODE;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('engine preflight', () => {
  it('fails a team task at once when claude is logged out, and spawns nothing', async () => {
    await startOffice('loggedout');
    expect(office.notReady('claude')).toBe('Claude Code: not logged in');
    expect(tasks.targets().find((t) => t.id === 'team')).toMatchObject({
      engine: 'claude',
      disabled: 'Claude Code: not logged in',
    });

    const summary = await tasks.create('погода на завтра в родосе', tmp, 'team');
    expect(summary.status).toBe('error');
    const detail = tasks.get(summary.id)!;
    expect(detail.error).toContain('Claude Code is not logged in');
    expect(detail.error).toContain('`claude auth login`');
    expect(detail.target).toBe('team');
    expect(readFakeLog(fakeLog)).toEqual([]);
  });

  it('fails a plain run at once too', async () => {
    await startOffice('loggedout');
    const summary = await tasks.create('hello', tmp);
    expect(summary.status).toBe('error');
    expect(tasks.get(summary.id)!.error).toContain('Claude Code is not logged in');
  });

  it('tells every client the engine status', async () => {
    await startOffice('loggedout');
    const loaded = emitted.filter((m) => m.type === 'catProfilesLoaded').at(-1);
    expect(loaded?.type === 'catProfilesLoaded' && loaded.engineOptions[0].status).toEqual({
      installed: true,
      version: '2.1.291',
      loggedIn: false,
      detail: 'not logged in',
    });
  });
});

describe('an auth error during a turn', () => {
  it('stops the task after one turn, says it once, and marks claude logged out', async () => {
    await startOffice('authfail');
    expect(office.notReady('claude')).toBeUndefined();

    const summary = await tasks.create('погода на завтра в родосе', tmp, 'team');
    const done = await waitFor(() => {
      const task = tasks.get(summary.id);
      return task && task.status !== 'running' ? task : undefined;
    });
    expect(done.status).toBe('error');
    expect(done.error).toContain('Oliver');
    expect(done.error).toContain('`claude auth login`');
    // No retry: one turn of the boss only.
    expect(readFakeLog(fakeLog).map((r) => r.cat)).toEqual(['boss']);
    // The raw "Not logged in · Please run /login" rows are dropped; the fix shows once.
    const rows = done.log.map((e) => e.text);
    expect(rows.filter((t) => /please run \/login/i.test(t))).toEqual([]);
    expect(rows.filter((t) => t.includes('not logged in'))).toHaveLength(1);
    expect(office.notReady('claude')).toBe('Claude Code: not logged in');
  });
});
