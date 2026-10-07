/**
 * Test harness for the CEO desk: a fake live-session engine for the CEO (one
 * fake process per session; a script per message that may call the desk
 * tools over the real MCP route), and an office of 1 boss + 2 workers whose
 * cats run the fake `claude` of catOfficeHarness.ts.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { TaskLogEntry } from '../../core/src/tasks.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { CeoDesk } from '../src/ceoDesk/ceoDesk.js';
import { CEO_MCP_PATH } from '../src/constants.js';
import { createHttpServer, type HttpServerHandle } from '../src/httpServer.js';
import { ClaudeAdapter } from '../src/orchestrator/claudeAdapter.js';
import type {
  LiveSession,
  OfficeMcpEndpoint,
  SessionEnd,
  SessionEngine,
  SessionRequest,
  TurnHandle,
} from '../src/orchestrator/engineAdapter.js';
import { Orchestrator } from '../src/orchestrator/orchestrator.js';
import { TaskManager } from '../src/taskBoard/taskManager.js';
import { FakeCatHost, waitFor, writeFakeClaude } from './catOfficeHarness.js';

export interface ToolReply {
  text: string;
  isError: boolean;
}

/** One message the desk sent into a session, with that session's setup. */
export type FakeTurn = SessionRequest & { message: string; images?: string[] };

export interface CeoTurn {
  req: FakeTurn;
  /** Call a desk tool like the real CLI: over HTTP with the token of the MCP config. */
  call(name: string, args?: Record<string, unknown>): Promise<ToolReply>;
}

export interface CeoReply {
  text?: string;
  ok?: boolean;
  error?: string;
  /** Activity-log lines streamed before the turn ends. */
  log?: TaskLogEntry[];
  /** Raw stream lines (Agent SDK messages as stream-json) streamed before the turn ends. */
  lines?: string[];
}

/** Never answers: the turn runs until it is interrupted or the session closes. */
export const HANG: Promise<CeoReply> = new Promise(() => {});

export class FakeCeoAdapter implements SessionEngine {
  readonly engine = 'claude' as const;
  /** Every message, in order. */
  readonly turns: FakeTurn[] = [];
  /** Every process (live session) the desk opened. */
  readonly sessions: SessionRequest[] = [];
  readonly replies: ToolReply[] = [];
  /** Live changes the desk applied (`update`), and how many interrupts and closes it sent. */
  readonly updates: Array<Parameters<LiveSession['update']>[0]> = [];
  interrupts = 0;
  closes = 0;
  /** What `update` answers: false means the change needs a new process. */
  liveUpdates = true;
  unavailable: string | undefined;
  /** `close` resolves only after this (the old process takes time to exit). */
  closeGate: Promise<void> = Promise.resolve();
  /** End the newest session as a crash would, with this error. */
  crash: (error: string) => void = () => {};

  constructor(public script: (turn: CeoTurn) => CeoReply | Promise<CeoReply>) {}

  choices() {
    return {
      models: ['haiku', 'opus'],
      efforts: ['high'],
      fullModelPattern: /^claude-/,
      ...(this.unavailable ? { unavailable: this.unavailable } : {}),
    };
  }

  mcpConfig(endpoint: OfficeMcpEndpoint): string {
    return JSON.stringify(endpoint);
  }

  interactiveResumeCommand(sessionId: string) {
    return { command: 'claude', args: ['--resume', sessionId] };
  }

  spawnTurn(): TurnHandle {
    throw new Error('The CEO desk runs in a live session (openSession)');
  }

  openSession(req: SessionRequest): LiveSession {
    this.sessions.push(req);
    const endpoint = JSON.parse(fs.readFileSync(req.mcpConfigFile, 'utf-8')) as OfficeMcpEndpoint;
    let rpcId = 0;
    const call = async (name: string, args: Record<string, unknown> = {}): Promise<ToolReply> => {
      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${endpoint.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: ++rpcId,
          method: 'tools/call',
          params: { name, arguments: args },
        }),
      });
      const body = (await res.json()) as {
        result: { content: Array<{ text: string }>; isError: boolean };
      };
      const reply = { text: body.result.content[0].text, isError: body.result.isError };
      this.replies.push(reply);
      return reply;
    };
    // Messages run one after another, like turns of one process.
    let chain = Promise.resolve();
    let waiting = 0;
    let busy = false;
    let closed = false;
    let interrupt = () => {};
    let end: (error?: string) => void = () => {};
    const ended = new Promise<SessionEnd>(
      (resolve) =>
        (end = (error) => resolve({ ...(error ? { error } : {}), sessionStarted: true })),
    );
    /** Sent messages that did not start yet (an interrupt reports them, like the CLI). */
    const waitingIds = new Set<string>();
    const setBusy = (next: boolean) => {
      if (next === busy) return;
      busy = next;
      req.onBusy(next);
    };
    const run = async (turn: FakeTurn, id: string) => {
      waitingIds.delete(id);
      if (closed) return;
      const interrupted = new Promise<undefined>(
        (resolve) => (interrupt = () => resolve(undefined)),
      );
      const reply = await Promise.race([
        Promise.resolve(this.script({ req: turn, call })),
        interrupted,
      ]);
      if (closed) return;
      for (const line of reply?.lines ?? []) req.onLine?.(line);
      for (const entry of reply?.log ?? []) req.onLog?.(entry);
      const ok = reply ? (reply.ok ?? true) : false;
      req.onResult({
        ok,
        text: reply?.text,
        sessionStarted: true,
        sessionCostUsd: 0.01 * this.turns.length,
        ...(ok ? {} : { error: reply ? (reply.error ?? 'failed') : 'interrupted' }),
      });
      if (--waiting === 0) setBusy(false);
    };
    this.crash = (error) => {
      closed = true;
      interrupt();
      end(error);
    };
    return {
      send: (message, images) => {
        const turn: FakeTurn = { ...req, message, images };
        const id = `m${this.turns.push(turn)}`;
        waiting++;
        waitingIds.add(id);
        setBusy(true);
        chain = chain.then(() => run(turn, id));
        return id;
      },
      interrupt: async () => {
        this.interrupts++;
        const queued = [...waitingIds];
        interrupt();
        return queued;
      },
      update: (change) => {
        this.updates.push(change);
        return this.liveUpdates;
      },
      close: async () => {
        this.closes++;
        closed = true;
        interrupt();
        await this.closeGate;
        end();
      },
      ended,
    };
  }
}

export interface DeskOffice {
  tmp: string;
  stateDir: string;
  host: FakeCatHost;
  office: Orchestrator;
  tasks: TaskManager;
  desk: CeoDesk;
  ceo: FakeCeoAdapter;
  server: HttpServerHandle;
  close(): Promise<void>;
}

const cat = (id: string, name: string, parentId: string | null, breed: string) => ({
  id,
  name,
  role: parentId ? 'Developer' : 'Team lead',
  systemPrompt: `I am ${name}.`,
  engine: 'claude',
  model: 'sonnet',
  effort: 'medium',
  appearance: { breed },
  parentId,
});

export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf-8' });
}

export function makeRepo(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q');
  fs.writeFileSync(path.join(dir, 'README.md'), 'hello\n');
  git(dir, 'add', '-A');
  git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init');
  return dir;
}

/** A fresh office with a CEO desk; `seed` may write state files before the desk starts. */
export async function startDeskOffice(
  script: FakeCeoAdapter['script'],
  opts: { tmp?: string; seed?: (stateDir: string) => void } = {},
): Promise<DeskOffice> {
  const tmp = opts.tmp ?? fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-desk-')));
  const stateDir = path.join(tmp, 'state');
  process.env.FAKE_LOG = path.join(tmp, 'fake.log');
  fs.mkdirSync(stateDir, { recursive: true });
  if (!fs.existsSync(path.join(stateDir, 'cats.json'))) {
    fs.writeFileSync(
      path.join(stateDir, 'cats.json'),
      JSON.stringify({
        version: 1,
        cats: [
          cat('boss', 'Oliver', null, 'marmalade'),
          cat('murka', 'Luna', 'boss', 'smokey'),
          cat('pushok', 'Milo', 'boss', 'snow'),
        ],
        catCeo: { enabled: false, model: 'haiku' },
      }),
    );
  }
  opts.seed?.(stateDir);
  const host = new FakeCatHost();
  const office = new Orchestrator({
    host,
    stateDir,
    adapters: [new ClaudeAdapter(writeFakeClaude(tmp))],
    emit: () => {},
    turnConcurrency: 6,
  });
  const tasks = new TaskManager({ host, stateDir, flows: office });
  const ceo = new FakeCeoAdapter(script);
  const desk = new CeoDesk({ stateDir, office, tasks, adapter: ceo });
  const server = await createHttpServer({
    embedded: true,
    token: 'tok',
    store: new AgentStateStore(),
    orchestrator: office,
    tasks,
    ceoDesk: desk,
  });
  const base = `http://127.0.0.1:${server.port}`;
  office.setServerUrl(base);
  desk.setServerUrl(base, CEO_MCP_PATH);
  return {
    tmp,
    stateDir,
    host,
    office,
    tasks,
    desk,
    ceo,
    server,
    close: async () => {
      desk.dispose();
      tasks.dispose();
      await server.app.close();
    },
  };
}

/** Wait until the desk has no turn and nothing queued. */
export function deskIdle(desk: CeoDesk): Promise<true> {
  return waitFor(() => {
    const { status } = desk.snapshot();
    return !status.busy && !status.queued ? true : undefined;
  }, 30_000);
}
