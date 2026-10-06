/**
 * Cat office wiring: resident characters (one per profile, across tasks),
 * flow states for the office scenes, and the cat console of profile cats
 * (OfficeCatSource). Uses the fake claude of catOfficeHarness.ts.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CatCharacters, ServerMessage } from '../../core/src/messages.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { CatSessionError } from '../src/catTerminal/catSessionSource.js';
import { OfficeCatSource } from '../src/catTerminal/officeCatSource.js';
import { sessionLockHolder } from '../src/catTerminal/sessionLocks.js';
import { createHttpServer, type HttpServerHandle } from '../src/httpServer.js';
import { ClaudeAdapter } from '../src/orchestrator/claudeAdapter.js';
import { Orchestrator } from '../src/orchestrator/orchestrator.js';
import { TaskManager } from '../src/taskBoard/taskManager.js';
import { FakeCatHost, readFakeLog, waitFor, writeFakeClaude } from './catOfficeHarness.js';

let tmp: string;
let stateDir: string;
let host: FakeCatHost;
let emitted: ServerMessage[];
let office: Orchestrator;
let tasks: TaskManager;
let server: HttpServerHandle;

const cat = (
  id: string,
  name: string,
  parentId: string | null,
  breed: string,
  engine = 'claude',
) => ({
  id,
  name,
  role: parentId ? 'Developer' : 'Team lead',
  systemPrompt: '',
  engine,
  model: 'sonnet',
  effort: 'medium',
  appearance: { breed },
  parentId,
});

function makeRepo(): string {
  const repo = path.join(tmp, 'repo');
  fs.mkdirSync(repo);
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args]);
  git('init', '-q');
  fs.writeFileSync(path.join(repo, 'README.md'), 'hello\n');
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init');
  return repo;
}

async function settled(id: string) {
  return waitFor(() => {
    const task = tasks.get(id);
    return task && task.status !== 'running' ? task : undefined;
  });
}

const lastCharacters = () =>
  emitted.filter((m): m is CatCharacters => m.type === 'catCharacters').at(-1);

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-residents-')));
  stateDir = path.join(tmp, 'state');
  process.env.FAKE_LOG = path.join(tmp, 'fake.log');
  delete process.env.FAKE_MODE;
  delete process.env.FAKE_HANG_CAT;
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, 'cats.json'),
    JSON.stringify({
      version: 1,
      cats: [
        cat('boss', 'Oliver', null, 'marmalade'),
        cat('murka', 'Luna', 'boss', 'smokey'),
        cat('pushok', 'Milo', 'boss', 'snow'),
        cat('codex', 'Kodi', 'boss', 'leo', 'codex'),
      ],
      // The Cat CEO has its own tests (catCeo*.test.ts): no judge runs here.
      catCeo: { enabled: false },
    }),
  );
  host = new FakeCatHost();
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
  tasks = new TaskManager({ host, stateDir, defaultCwd: tmp, flows: office });
});

afterEach(async () => {
  tasks.dispose();
  await server.app.close();
  delete process.env.FAKE_MODE;
  delete process.env.FAKE_HANG_CAT;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('resident cats', () => {
  it('spawns one character per profile at start and follows profile changes', () => {
    expect(host.spawned.map((s) => s.id)).toEqual([1, 2, 3, 4]);
    expect(office.profileMessages().at(-1)).toMatchObject({
      type: 'catCharacters',
      characters: [
        { catId: 'boss', id: 1, name: 'Oliver', working: false },
        { catId: 'murka', id: 2, appearance: { breed: 'smokey' } },
        { catId: 'pushok', id: 3 },
        { catId: 'codex', id: 4 },
      ],
    });

    const fresh = {
      ...cat('mia', 'Mia', 'boss', 'mochi'),
      appearance: { breed: 'mochi', pattern: 'tabby' },
    };
    expect(office.editProfiles({ type: 'saveCatProfile', profile: fresh })).toBeUndefined();
    expect(host.spawned.map((s) => s.id)).toEqual([1, 2, 3, 4, 5]);
    expect(lastCharacters()?.characters.find((c) => c.catId === 'mia')).toMatchObject({
      id: 5,
      appearance: { pattern: 'tabby' },
    });

    expect(office.editProfiles({ type: 'deleteCatProfile', id: 'murka' })).toBeUndefined();
    expect(host.removed).toEqual([2]);
    expect(lastCharacters()?.characters.map((c) => c.catId)).toEqual([
      'boss',
      'pushok',
      'codex',
      'mia',
    ]);
  });

  it('marks the tree root as the team lead; the flag follows a new root', () => {
    const leads = () =>
      office
        .profileMessages()
        .filter((m): m is CatCharacters => m.type === 'catCharacters')
        .at(-1)!
        .characters.filter((c) => c.lead)
        .map((c) => c.catId);
    expect(leads()).toEqual(['boss']);

    expect(office.editProfiles({ type: 'promoteCatToBoss', id: 'pushok' })).toBeUndefined();
    expect(leads()).toEqual(['pushok']);
    // The broadcast after the change carries the new lead too.
    expect(
      lastCharacters()
        ?.characters.filter((c) => c.lead)
        .map((c) => c.catId),
    ).toEqual(['pushok']);

    // The root is deleted: its first report becomes the root and the lead.
    expect(office.editProfiles({ type: 'deleteCatProfile', id: 'pushok' })).toBeUndefined();
    expect(leads()).toEqual(['boss']);
  });

  it('keeps one character per cat across two team tasks and links it to the newest task', async () => {
    const repo = makeRepo();
    const first = await settled((await tasks.create('one', repo, 'team')).id);
    expect(first.status).toBe('done');
    // The task card shows the root's resident character with its breed.
    expect(first).toMatchObject({ agentId: 1, palette: 0 });
    const second = await settled((await tasks.create('two', repo, 'team')).id);
    expect(second.status).toBe('done');

    expect(host.spawned).toHaveLength(4);
    expect(host.removed).toEqual([]);
    expect(new Set(host.turns.map((t) => t.id))).toEqual(new Set([1, 2, 3]));
    // A turn of the second task points the same character at a new session.
    const bossSessions = new Set(host.turns.filter((t) => t.id === 1).map((t) => t.sessionId));
    expect(bossSessions.size).toBe(2);
    expect(
      host.linked
        .filter((l) => l.taskId === second.id)
        .map((l) => l.id)
        .sort(),
    ).toEqual([1, 2, 3]);
    expect(lastCharacters()?.characters.every((c) => !c.working)).toBe(true);
  });

  it('sends the team with every flow state and always ends with a final state', async () => {
    const repo = makeRepo();
    const task = await settled((await tasks.create('one', repo, 'team')).id);
    const states = emitted.filter((m) => m.type === 'flowStateChanged');
    expect(states[0]).toMatchObject({
      taskId: task.id,
      state: 'briefing',
      rootCatId: 'boss',
      catIds: ['boss', 'murka', 'pushok', 'codex'],
    });
    expect(states.at(-1)).toMatchObject({ state: 'done', rootCatId: 'boss' });

    process.env.FAKE_MODE = 'hang';
    const { id } = await tasks.create('hang', repo, 'murka');
    await waitFor(() =>
      readFakeLog(process.env.FAKE_LOG!).some((r) => r.message.includes('hang')) ? true : undefined,
    );
    tasks.dispose();
    expect(emitted.filter((m) => m.type === 'flowStateChanged').at(-1)).toMatchObject({
      taskId: id,
      state: 'interrupted',
      catIds: ['murka'],
    });
  });

  it('marks a Codex cat as not ready in the task form', () => {
    const targets = tasks.targets();
    expect(targets.find((t) => t.id === 'team')).toEqual({
      id: 'team',
      label: 'Team: Oliver leads',
    });
    expect(targets.find((t) => t.id === 'codex')?.disabled).toBe('codex adapter not ready');
    expect(targets.find((t) => t.id === 'murka')?.disabled).toBeUndefined();
  });
});

describe('cat console of profile cats', () => {
  it('starts a one-cat task when the cat has no live task, and shows its turns', async () => {
    const source = new OfficeCatSource(office, tasks);
    expect(source.snapshot('2')).toMatchObject({ title: 'Luna: Developer', entries: [] });
    const frames: string[] = [];
    const off = source.subscribe('2', (f) => frames.push(f.type));
    await source.send('2', 'write a file please');
    const task = await waitFor(() => tasks.list().find((t) => t.target === 'murka'));
    expect(task.prompt).toBe('write a file please');
    await settled(task.id);
    const entries = source.snapshot('2')!.entries;
    expect(entries[0]).toMatchObject({ kind: 'user' });
    expect(entries[0].text).toContain('write a file please');
    expect(entries.some((e) => e.kind === 'text')).toBe(true);
    expect(frames).toContain('entries');
    expect(frames).toContain('status');
    off();
    // Unknown ids fall through to the task board (no such task cat).
    expect(source.snapshot('77')).toBeUndefined();
  });

  it('queues a message into the next turn of a live task, and takes the wheel only between turns', async () => {
    process.env.FAKE_HANG_CAT = 'murka';
    const repo = makeRepo();
    const { id } = await tasks.create('make files', repo, 'team');
    const source = new OfficeCatSource(office, tasks);
    // Luna hangs in its turn: busy, no wheel.
    await waitFor(() => (office.hasPendingTurn('murka') ? true : undefined));
    await expect(source.beginWheel('2')).rejects.toMatchObject({ code: 409 });
    // The boss waits for Luna's report: idle between turns, session started.
    await waitFor(() =>
      !office.hasPendingTurn('boss') && office.liveMember('boss')?.member.started
        ? true
        : undefined,
    );
    expect(source.snapshot('1')!.status).toMatchObject({ busy: false, wheelHeld: false });
    const wheel = await source.beginWheel('1');
    expect(wheel.cwd).toBe(path.join(stateDir, 'worktrees', id));
    expect(sessionLockHolder(wheel.sessionId)).toBe('wheel');
    expect(source.snapshot('1')!.status.wheelHeld).toBe(true);
    await expect(source.send('1', 'hi')).rejects.toBeInstanceOf(CatSessionError);
    await source.endWheel('1');
    expect(sessionLockHolder(wheel.sessionId)).toBeUndefined();

    // A message to the boss joins its live task: its next turn reads it.
    await source.send('1', 'please also add a readme');
    await waitFor(() =>
      readFakeLog(process.env.FAKE_LOG!).some(
        (r) =>
          r.cat === 'boss' &&
          r.message.includes('[Message from the user]\nplease also add a readme'),
      )
        ? true
        : undefined,
    );
    expect(tasks.list()).toHaveLength(1);
  });
});
