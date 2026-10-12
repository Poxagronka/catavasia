import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import * as os from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import type { CatSessionFrame } from '../../core/src/catSession.js';
import { EDIT_RIGHTS_HINT } from '../../core/src/constants.js';
import {
  CatSessionError,
  type CatSessionSnapshot,
  type CatSessionSource,
  toConsoleEntry,
  type WheelSession,
} from '../src/catTerminal/catSessionSource.js';
import { registerCatTerminalRoutes } from '../src/catTerminal/catTerminalRoutes.js';
import type { IPty, PtyModule, PtySpawnOptions } from '../src/catTerminal/ptyModule.js';
import { acquireSessionLock } from '../src/catTerminal/sessionLocks.js';

const TOKEN = 'cat-token';
const CAT = '7';

/** One cat with a canned session; records what the routes ask of it. */
class FakeSource implements CatSessionSource {
  sent: string[] = [];
  wheelsTaken = 0;
  wheelsEnded = 0;
  busy = false;
  snapshot(catId: string): CatSessionSnapshot | undefined {
    if (catId !== CAT) return undefined;
    return {
      title: 'Pixel',
      entries: [{ kind: 'user', text: 'hi' }],
      status: { busy: this.busy, wheelHeld: false },
    };
  }
  subscribe() {
    return () => {};
  }
  async send(catId: string, text: string): Promise<void> {
    if (catId !== CAT) throw new CatSessionError(404, 'No session for this cat');
    if (this.busy) throw new CatSessionError(409, 'The cat is busy with its session');
    this.sent.push(text);
  }
  async beginWheel(): Promise<WheelSession> {
    if (this.busy) throw new CatSessionError(409, 'The cat is busy with its session');
    this.wheelsTaken++;
    return { sessionId: 'sess-1', cwd: os.tmpdir() };
  }
  async endWheel(): Promise<void> {
    this.wheelsEnded++;
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
let source: FakeSource;
let ptys: FakePty[];
let base: string;
let loginEnded: string[];

beforeEach(async () => {
  source = new FakeSource();
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
    source,
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
  base = `127.0.0.1:${typeof addr === 'object' ? addr?.port : 0}/api/cat-sessions/${CAT}`;
});

afterEach(async () => {
  await app.close();
});

const post = (query: string, text: string, cat = CAT) =>
  fetch(`http://${base.replace(`/${CAT}`, `/${cat}`)}/messages${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

function collect(socket: WebSocket): CatSessionFrame[] {
  const frames: CatSessionFrame[] = [];
  socket.on('message', (d: Buffer) => frames.push(JSON.parse(d.toString()) as CatSessionFrame));
  return frames;
}

describe('console routes', () => {
  it('maps a task log row into a console entry', () => {
    expect(toConsoleEntry({ kind: 'tool', text: 'x' })).toEqual({
      kind: 'tool',
      name: 'Tool',
      text: 'x',
    });
    expect(toConsoleEntry({ kind: 'message', name: 'a', text: 'b' })).toEqual({
      kind: 'text',
      text: 'a: b',
    });
  });

  it('streams the snapshot first', async () => {
    const socket = new WebSocket(`ws://${base}/events`);
    const frames = collect(socket);
    await waitFor(() => frames.length > 0);
    expect(frames[0]).toMatchObject({ type: 'snapshot', title: 'Pixel', status: { busy: false } });
    socket.close();
  });

  it('delivers a message, and answers 404 / 400 / 409 for the bad cases', async () => {
    expect((await post(`?token=${TOKEN}`, 'meow')).status).toBe(202);
    expect(source.sent).toEqual(['meow']);
    expect((await post(`?token=${TOKEN}`, 'meow', '99')).status).toBe(404);
    expect((await post(`?token=${TOKEN}`, '   ')).status).toBe(400);
    source.busy = true;
    expect((await post(`?token=${TOKEN}`, 'again')).status).toBe(409);
  });
});

describe('wheel', () => {
  it('refuses the wheel while the cat is busy', async () => {
    source.busy = true;
    const socket = new WebSocket(`ws://${base}/terminal?token=${TOKEN}`);
    const code = await new Promise<number>((r) => socket.on('close', (c: number) => r(c)));
    expect(code).toBe(4409);
    expect(ptys).toHaveLength(0);
  });

  it('runs the resume command in a PTY and frees the session on exit', async () => {
    const socket = new WebSocket(`ws://${base}/terminal?token=${TOKEN}&cols=90&rows=20`);
    const out: string[] = [];
    socket.on('message', (d: Buffer) => out.push(d.toString()));
    const pty = await waitFor(() => ptys[0]);
    expect(pty.file).toBe('claude-test');
    expect(pty.args).toEqual(['--resume', 'sess-1']);
    expect([pty.opts.cols, pty.opts.rows]).toEqual([90, 20]);
    socket.send(JSON.stringify({ type: 'input', data: 'hi' }));
    await waitFor(() => out.some((m) => m.includes('echo:hi')));
    socket.close();
    await waitFor(() => source.wheelsEnded === 1);
  });
});

describe('session lock', () => {
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
    `ws://${base.replace(`/api/cat-sessions/${CAT}`, '')}/api/engines/${engine}/login${query}`;

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
    expect((await post('', 'hi')).status).toBe(401);
    const wrong = await post('?token=wrong', 'hi');
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: EDIT_RIGHTS_HINT });
    expect(source.sent).toEqual([]);

    const socket = new WebSocket(`ws://${base}/terminal`);
    const code = await new Promise<number>((r) => socket.on('close', (c: number) => r(c)));
    expect(code).toBe(4401);
    expect(ptys).toHaveLength(0);
  });
});
