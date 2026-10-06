import fastifyWebsocket from '@fastify/websocket';
import { execFileSync } from 'child_process';
import Fastify, { type FastifyInstance } from 'fastify';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import type { CatSessionFrame } from '../../core/src/catSession.js';
import { EDIT_RIGHTS_HINT } from '../../core/src/constants.js';
import { TaskBoardCatSource, toConsoleEntry } from '../src/catTerminal/catSessionSource.js';
import { registerCatTerminalRoutes } from '../src/catTerminal/catTerminalRoutes.js';
import type { IPty, PtyModule, PtySpawnOptions } from '../src/catTerminal/ptyModule.js';
import { acquireSessionLock, sessionLockHolder } from '../src/catTerminal/sessionLocks.js';
import { type TaskAgentHost, TaskManager } from '../src/taskBoard/taskManager.js';

/** Stand-in for `claude -p`: appends the prompt to meow.txt, prints stream-json,
 *  records its argv, and sleeps first when the prompt says SLOW. */
const FAKE_CLAUDE = `#!/usr/bin/env node
const fs = require('fs');
let prompt = '';
process.stdin.on('data', (d) => (prompt += d));
process.stdin.on('end', () => {
  const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
  fs.appendFileSync(process.env.ARGV_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');
  setTimeout(() => {
    fs.appendFileSync('meow.txt', prompt + '\\n');
    out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Write', input: { file_path: 'meow.txt' } }] } });
    out({ type: 'assistant', message: { content: [{ type: 'text', text: 'Purr: ' + prompt }] } });
    out({ type: 'result', subtype: 'success', is_error: false, result: 'ok' });
  }, prompt.includes('SLOW') ? 800 : 0);
});
`;

const TOKEN = 'cat-token';

let tmp: string;
let stateDir: string;
let fakeBin: string;
let argvLog: string;

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
  resumed: number[] = [];
  launchHeadlessAgent() {
    return { id: 7, palette: 1, hueShift: 0 };
  }
  finishHeadlessAgent() {}
  resumeHeadlessAgent(id: number) {
    this.resumed.push(id);
  }
  restoreFinishedAgent() {
    return { id: 8 };
  }
}

/** A PTY that echoes input and exits on kill. */
class FakePty implements IPty {
  readonly pid = 4242;
  private data: Array<(d: string) => void> = [];
  private exit: Array<(e: { exitCode: number }) => void> = [];
  constructor(
    readonly file: string,
    readonly args: string[],
    readonly opts: PtySpawnOptions,
  ) {}
  onData(l: (d: string) => void) {
    this.data.push(l);
  }
  onExit(l: (e: { exitCode: number }) => void) {
    this.exit.push(l);
  }
  write(d: string) {
    for (const l of this.data) l(`echo:${d}`);
  }
  resize() {}
  kill() {
    for (const l of this.exit) l({ exitCode: 0 });
  }
}

async function waitFor<T>(fn: () => T | undefined | false, ms = 5000): Promise<T> {
  for (let i = 0; i < ms / 20; i++) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('timed out');
}

let app: FastifyInstance;
let manager: TaskManager;
let host: FakeHost;
let ptys: FakePty[];
let base: string;
let loginEnded: string[];
/** The work folder of the tasks (a git repo). */
let repo: string;

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-cat-')));
  stateDir = path.join(tmp, 'state');
  fakeBin = path.join(tmp, 'fake-claude');
  argvLog = path.join(tmp, 'argv.log');
  fs.writeFileSync(fakeBin, FAKE_CLAUDE, { mode: 0o755 });
  process.env.ARGV_LOG = argvLog;
  host = new FakeHost();
  repo = makeRepo();
  manager = new TaskManager({ host, stateDir, claudeBin: fakeBin });
  ptys = [];
  loginEnded = [];
  const ptyModule: PtyModule = {
    spawn: (file, args, opts) => {
      const p = new FakePty(file, args, opts);
      ptys.push(p);
      return p;
    },
  };
  app = Fastify();
  await app.register(fastifyWebsocket);
  registerCatTerminalRoutes(app, {
    source: new TaskBoardCatSource(manager),
    isPrivileged: (req) => new URL(req.url, 'http://x').searchParams.get('token') === TOKEN,
    isSameOrigin: () => true,
    pty: () => ({ module: ptyModule, reason: null }),
    claudeBin: 'claude-test',
    engineLogin: {
      command: (engine) =>
        engine === 'claude' ? { command: 'claude', args: ['auth', 'login'] } : undefined,
      ended: (engine) => loginEnded.push(engine),
    },
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const addr = app.server.address();
  base = `127.0.0.1:${typeof addr === 'object' ? addr?.port : 0}/api/cat-sessions/7`;
});

afterEach(async () => {
  await app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const settled = () => waitFor(() => !manager.isRunning(manager.findByAgent(7)!.id));
const post = (query: string, text: string) =>
  fetch(`http://${base}/messages${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

function collect(socket: WebSocket): CatSessionFrame[] {
  const frames: CatSessionFrame[] = [];
  socket.on('message', (d: Buffer) => frames.push(JSON.parse(d.toString()) as CatSessionFrame));
  return frames;
}

describe('console event mapping', () => {
  it('maps task log rows and the prompt into console entries', async () => {
    await manager.create('fix the bug', repo);
    await settled();
    const snap = new TaskBoardCatSource(manager).snapshot('7')!;
    expect(snap.title).toBe('fix the bug');
    expect(snap.entries).toEqual([
      { kind: 'user', text: 'fix the bug' },
      { kind: 'tool', name: 'Write', text: 'meow.txt' },
      { kind: 'text', text: 'Purr: fix the bug' },
    ]);
    expect(snap.status).toEqual({ busy: false, wheelHeld: false, wheelUnavailable: undefined });
    expect(toConsoleEntry({ kind: 'tool', text: 'x' })).toEqual({
      kind: 'tool',
      name: 'Tool',
      text: 'x',
    });
    expect(new TaskBoardCatSource(manager).snapshot('99')).toBeUndefined();

    // After a restart agent ids start at 1 again: a task from an earlier
    // server process never maps to a live cat.
    const restarted = new TaskManager({ host, stateDir, claudeBin: fakeBin });
    const file = path.join(stateDir, 'tasks.json');
    const stored = JSON.parse(fs.readFileSync(file, 'utf-8'));
    for (const t of Object.values(stored.tasks) as Array<{ ownerPid: number }>) t.ownerPid = 1;
    fs.writeFileSync(file, JSON.stringify(stored));
    expect(restarted.findByAgent(7)).toBeUndefined();
  });

  it('streams a snapshot, then live entries and status frames', async () => {
    await manager.create('first', repo);
    await settled();
    const socket = new WebSocket(`ws://${base}/events`);
    const frames = collect(socket);
    await waitFor(() => frames.length > 0);
    expect(frames[0]).toMatchObject({ type: 'snapshot', status: { busy: false } });

    expect((await post(`?token=${TOKEN}`, 'second')).status).toBe(202);
    await settled();
    await waitFor(() => frames.some((f) => f.type === 'status' && !f.status.busy));
    const entries = frames.flatMap((f) => (f.type === 'entries' ? f.entries : []));
    expect(entries).toEqual([
      { kind: 'user', text: 'second' },
      { kind: 'tool', name: 'Write', text: 'meow.txt' },
      { kind: 'text', text: 'Purr: second' },
    ]);
    expect(frames.some((f) => f.type === 'status' && f.status.busy)).toBe(true);
    socket.close();
  });
});

describe('send path', () => {
  it('resumes the same session in the reopened worktree and commits again', async () => {
    const created = await manager.create('first', repo);
    await settled();
    expect((await post(`?token=${TOKEN}`, 'second')).status).toBe(202);
    await settled();

    const runs = fs
      .readFileSync(argvLog, 'utf-8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as string[]);
    const sessionId = runs[0][runs[0].indexOf('--session-id') + 1];
    expect(runs[1]).toContain('--resume');
    expect(runs[1][runs[1].indexOf('--resume') + 1]).toBe(sessionId);
    expect(host.resumed).toEqual([7]);
    expect(git(repo, 'show', `task/${created.id}:meow.txt`)).toBe('first\nsecond\n');
    expect(manager.get(created.id)).toMatchObject({ status: 'done' });
    expect(manager.get(created.id)!.log.filter((e) => e.kind === 'user')).toHaveLength(1);
  });

  it('answers 404 for a cat with no session and 400 for an empty message', async () => {
    expect((await post(`?token=${TOKEN}`, 'hi')).status).toBe(404);
    await manager.create('first', repo);
    await settled();
    expect((await post(`?token=${TOKEN}`, '   ')).status).toBe(400);
  });
});

describe('session lock', () => {
  it('refuses a message and the wheel while a turn runs', async () => {
    await manager.create('SLOW first', repo);
    const task = manager.findByAgent(7)!;
    expect(manager.isRunning(task.id)).toBe(true);
    expect((await post(`?token=${TOKEN}`, 'again')).status).toBe(409);

    const socket = new WebSocket(`ws://${base}/terminal?token=${TOKEN}`);
    const code = await new Promise<number>((r) => socket.on('close', (c: number) => r(c)));
    expect(code).toBe(4409);
    expect(ptys).toHaveLength(0);
    await settled();
  });

  it('takes the wheel when idle, blocks turns while held, releases on exit', async () => {
    const created = await manager.create('first', repo);
    await settled();
    const sessionId = JSON.parse(fs.readFileSync(argvLog, 'utf-8').split('\n')[0])[1] as string;

    const socket = new WebSocket(`ws://${base}/terminal?token=${TOKEN}&cols=90&rows=20`);
    const out: string[] = [];
    socket.on('message', (d: Buffer) => out.push(d.toString()));
    const pty = await waitFor(() => ptys[0]);
    expect(pty.file).toBe('claude-test');
    expect(pty.args).toEqual(['--resume', sessionId]);
    expect(pty.opts.cwd).toBe(path.join(stateDir, 'worktrees', created.id));
    expect(fs.existsSync(pty.opts.cwd)).toBe(true);
    expect([pty.opts.cols, pty.opts.rows]).toEqual([90, 20]);
    expect(sessionLockHolder(sessionId)).toBe('wheel');
    expect(manager.isWheelHeld(created.id)).toBe(true);

    socket.send(JSON.stringify({ type: 'input', data: 'hi' }));
    await waitFor(() => out.some((m) => m.includes('echo:hi')));
    expect((await post(`?token=${TOKEN}`, 'blocked')).status).toBe(409);

    socket.close();
    await waitFor(() => !manager.isWheelHeld(created.id));
    expect(sessionLockHolder(sessionId)).toBeUndefined();
    expect(fs.existsSync(pty.opts.cwd)).toBe(false);
  });

  it('lets only one holder take a session id', () => {
    const release = acquireSessionLock('s-1', 'turn')!;
    expect(acquireSessionLock('s-1', 'wheel')).toBeNull();
    release();
    release();
    const again = acquireSessionLock('s-1', 'wheel');
    expect(again).not.toBeNull();
    again!();
  });
});

describe('engine login terminal', () => {
  const loginUrl = (engine: string, query: string) =>
    `ws://${base.replace('/api/cat-sessions/7', '')}/api/engines/${engine}/login${query}`;

  it('runs the engine login command in a PTY and re-probes when it ends', async () => {
    const socket = new WebSocket(loginUrl('claude', `?token=${TOKEN}&cols=80&rows=24`));
    const out: string[] = [];
    socket.on('message', (d: Buffer) => out.push(d.toString()));
    const pty = await waitFor(() => ptys[0]);
    expect([pty.file, ...pty.args]).toEqual(['claude', 'auth', 'login']);
    expect(pty.opts.cwd).toBe(os.homedir());
    socket.send(JSON.stringify({ type: 'input', data: 'code' }));
    await waitFor(() => out.some((m) => m.includes('echo:code')));
    socket.close();
    await waitFor(() => loginEnded.length === 1);
    expect(loginEnded).toEqual(['claude']);
  });

  it('needs the token, and knows only its engines', async () => {
    const untokened = new WebSocket(loginUrl('claude', ''));
    expect(await new Promise<number>((r) => untokened.on('close', (c: number) => r(c)))).toBe(4401);
    const unknown = new WebSocket(loginUrl('gemini', `?token=${TOKEN}`));
    expect(await new Promise<number>((r) => unknown.on('close', (c: number) => r(c)))).toBe(4404);
    expect(ptys).toHaveLength(0);
  });
});

describe('token gating', () => {
  it('needs the token to send a message or take the wheel', async () => {
    await manager.create('first', repo);
    await settled();
    expect((await post('', 'hi')).status).toBe(401);
    const wrong = await post('?token=wrong', 'hi');
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: EDIT_RIGHTS_HINT });

    const socket = new WebSocket(`ws://${base}/terminal`);
    const code = await new Promise<number>((r) => socket.on('close', (c: number) => r(c)));
    expect(code).toBe(4401);
    expect(ptys).toHaveLength(0);
  });
});
