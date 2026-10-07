/**
 * Test harness for the CEO desk: a fake EngineAdapter for the CEO (a script
 * per turn that may call the desk tools over the real MCP route), and an
 * office of 1 boss + 2 workers whose cats run the fake `claude` of
 * catOfficeHarness.ts.
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
  EngineAdapter,
  OfficeMcpEndpoint,
  TurnHandle,
  TurnOutcome,
  TurnRequest,
} from '../src/orchestrator/engineAdapter.js';
import { Orchestrator } from '../src/orchestrator/orchestrator.js';
import { TaskManager } from '../src/taskBoard/taskManager.js';
import { FakeCatHost, waitFor, writeFakeClaude } from './catOfficeHarness.js';

export interface ToolReply {
  text: string;
  isError: boolean;
}

export interface CeoTurn {
  req: TurnRequest;
  /** Call a desk tool like the real CLI: over HTTP with the token of the MCP config. */
  call(name: string, args?: Record<string, unknown>): Promise<ToolReply>;
}

export interface CeoReply {
  text?: string;
  ok?: boolean;
  error?: string;
  /** Activity-log lines streamed before the turn ends. */
  log?: TaskLogEntry[];
}

/** Never answers: the turn runs until it is killed. */
export const HANG: Promise<CeoReply> = new Promise(() => {});

export class FakeCeoAdapter implements EngineAdapter {
  readonly engine = 'claude' as const;
  readonly turns: TurnRequest[] = [];
  readonly replies: ToolReply[] = [];
  unavailable: string | undefined;

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

  spawnTurn(req: TurnRequest): TurnHandle {
    this.turns.push(req);
    let kill = () => {};
    const killed = new Promise<undefined>((resolve) => (kill = () => resolve(undefined)));
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
    const done = (async (): Promise<TurnOutcome> => {
      const reply = await Promise.race([Promise.resolve(this.script({ req, call })), killed]);
      if (!reply) return { ok: false, error: 'Exit code none: killed', sessionStarted: true };
      for (const entry of reply.log ?? []) req.onLog?.(entry);
      const ok = reply.ok ?? true;
      return {
        ok,
        text: reply.text,
        sessionStarted: true,
        sessionCostUsd: 0.01 * this.turns.length,
        ...(ok ? {} : { error: reply.error ?? 'failed' }),
      };
    })();
    return { done, kill };
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
