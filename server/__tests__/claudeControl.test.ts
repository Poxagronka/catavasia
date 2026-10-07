/**
 * Slash commands and connectors of the CEO dock: the Agent SDK control session
 * (a fake query), the `claude mcp` CLI calls (a fake claude that records its
 * arguments), the HTTP routes, and slash commands as their own turn.
 */

import Fastify from 'fastify';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import type { CatSessionEntry, ContextUse } from '../../core/src/catSession.js';
import {
  addArgs,
  ClaudeControl,
  type QueryFn,
  splitCommand,
  toConnectors,
} from '../src/ceoDesk/claudeControl.js';
import { registerConnectorRoutes } from '../src/ceoDesk/connectorRoutes.js';
import type { DeskRow, DeskState } from '../src/ceoDesk/deskStore.js';
import { DeskStream } from '../src/ceoDesk/deskStream.js';
import { takeTurnParts } from '../src/ceoDesk/deskTurn.js';

/** Shapes of CLI 2.1.292 (`initialize` commands, `mcp_status` rows). */
const COMMANDS = [
  {
    name: 'clear',
    description: 'Start a new session',
    argumentHint: '[name]',
    aliases: ['reset', 'new'],
    builtin: true,
  },
  {
    name: 'model',
    description: 'Set the AI model for Claude Code',
    argumentHint: '<model>',
    builtin: true,
  },
  { name: '__remote-workflow', description: 'internal', argumentHint: '', builtin: true },
  {
    name: 'agents',
    description: '(removed) Ask Claude to create/manage subagents, or edit .claude/agents/',
    argumentHint: '',
    builtin: true,
  },
  { name: 'tidy-notes', description: 'Tidy my notes', argumentHint: '' },
];
const STATUSES = [
  {
    name: 'slack-user',
    status: 'connected',
    scope: 'user',
    source: 'user',
    config: { type: 'stdio', command: 'node', args: ['slack.js'] },
  },
  {
    name: 'claude.ai Gmail',
    status: 'needs-auth',
    scope: 'claudeai',
    source: 'claudeai',
    config: { type: 'claudeai-proxy', url: 'https://mcp.example/gmail', id: 'x' },
  },
  {
    name: 'plugin:pw:pw',
    status: 'failed',
    scope: 'dynamic',
    source: 'plugin',
    error: 'spawn ENOENT',
    config: { type: 'stdio', command: 'npx' },
  },
  {
    name: 'old',
    status: 'disabled',
    scope: 'local',
    source: 'local',
    config: { type: 'http', url: 'https://old.example/mcp' },
  },
];

interface FakeLog {
  queries: { cwd?: string; settings?: unknown }[];
  toggles: [string, boolean][];
  closed: number;
}

/** A fake SDK query: `statusRounds` are the answers of mcpServerStatus() in turn. */
function fakeQuery(statusRounds: unknown[][]): { fn: QueryFn; log: FakeLog } {
  const log: FakeLog = { queries: [], toggles: [], closed: 0 };
  let round = 0;
  const fn = ((args: { options: { cwd?: string; settingSources?: unknown } }) => {
    log.queries.push({ cwd: args.options.cwd, settings: args.options.settingSources });
    return {
      supportedCommands: async () => COMMANDS,
      mcpServerStatus: async () => statusRounds[Math.min(round++, statusRounds.length - 1)],
      toggleMcpServer: async (name: string, enabled: boolean) => {
        log.toggles.push([name, enabled]);
      },
      close: () => {
        log.closed++;
      },
    };
  }) as unknown as QueryFn;
  return { fn, log };
}

const tmp: string[] = [];
function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-control-'));
  tmp.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tmp.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A fake `claude` that writes its arguments, one per line, to `args.txt`. */
function recordingClaude(): { bin: string; args: () => string[] } {
  const dir = tempDir();
  const bin = path.join(dir, 'claude');
  fs.writeFileSync(bin, `#!/bin/sh\nfor a in "$@"; do echo "$a"; done > "${dir}/args.txt"\n`, {
    mode: 0o755,
  });
  return {
    bin,
    args: () => fs.readFileSync(path.join(dir, 'args.txt'), 'utf-8').trim().split('\n'),
  };
}

describe('connector helpers', () => {
  it('splits a command line, keeping quoted words together', () => {
    expect(splitCommand('npx -y "my server" \'a b\' --port 3')).toEqual([
      'npx',
      '-y',
      'my server',
      'a b',
      '--port',
      '3',
    ]);
  });

  it('adds an address as an http server and a command as a stdio one', () => {
    expect(
      addArgs({ name: 'sentry', target: ' https://mcp.sentry.dev/mcp ', scope: 'user' }),
    ).toEqual([
      'mcp',
      'add',
      '--scope',
      'user',
      '--transport',
      'http',
      'sentry',
      'https://mcp.sentry.dev/mcp',
    ]);
    expect(addArgs({ name: 'files', target: 'npx -y files-mcp', scope: 'local' })).toEqual([
      'mcp',
      'add',
      '--scope',
      'local',
      'files',
      '--',
      'npx',
      '-y',
      'files-mcp',
    ]);
  });

  it('turns SDK statuses into connector rows', () => {
    expect(toConnectors(STATUSES as never)).toEqual([
      {
        name: 'slack-user',
        status: 'connected',
        source: 'user',
        target: 'node slack.js',
        web: false,
      },
      {
        name: 'claude.ai Gmail',
        status: 'needs-auth',
        source: 'claudeai',
        target: 'https://mcp.example/gmail',
        web: true,
      },
      {
        name: 'plugin:pw:pw',
        status: 'failed',
        source: 'plugin',
        target: 'npx',
        error: 'spawn ENOENT',
        web: false,
      },
      {
        name: 'old',
        status: 'disabled',
        source: 'local',
        target: 'https://old.example/mcp',
        web: true,
      },
    ]);
  });
});

describe('ClaudeControl', () => {
  it('lists the commands without internal and removed ones, cached per folder', async () => {
    const { fn, log } = fakeQuery([STATUSES]);
    const control = new ClaudeControl(process.execPath, fn);
    const list = await control.commands('/a');
    expect(list.map((c) => c.name)).toEqual(['clear', 'model', 'tidy-notes']);
    expect(list[0]).toEqual({
      name: 'clear',
      description: 'Start a new session',
      argumentHint: '[name]',
      aliases: ['reset', 'new'],
      builtin: true,
    });
    await control.commands('/a');
    await control.commands('/b');
    expect(log.queries).toEqual([
      { cwd: '/a', settings: ['user', 'project', 'local'] },
      { cwd: '/b', settings: ['user', 'project', 'local'] },
    ]);
    expect(log.closed).toBe(2);
  });

  it('waits for servers that are still connecting', async () => {
    const pending = STATUSES.map((s) => ({ ...s, status: 'pending' }));
    const { fn, log } = fakeQuery([pending, STATUSES]);
    const rows = await new ClaudeControl(process.execPath, fn).connectors('/a');
    expect(rows.map((r) => r.status)).toEqual(['connected', 'needs-auth', 'failed', 'disabled']);
    expect(log.closed).toBe(1);
  });

  it('turns a server off through the SDK', async () => {
    const { fn, log } = fakeQuery([STATUSES]);
    await new ClaudeControl(process.execPath, fn).toggle('/a', 'slack-user', false);
    expect(log.toggles).toEqual([['slack-user', false]]);
  });

  it('adds and removes with the claude mcp CLI', async () => {
    const fake = recordingClaude();
    const control = new ClaudeControl(fake.bin, fakeQuery([STATUSES]).fn);
    const cwd = tempDir();
    await control.add(cwd, { name: 'files', target: 'npx files-mcp', scope: 'user' });
    expect(fake.args()).toEqual([
      'mcp',
      'add',
      '--scope',
      'user',
      'files',
      '--',
      'npx',
      'files-mcp',
    ]);
    await control.remove(cwd, 'old', 'local');
    expect(fake.args()).toEqual(['mcp', 'remove', 'old', '--scope', 'local']);
    // A claude.ai or plugin server has no scope the CLI knows.
    await control.remove(cwd, 'claude.ai Gmail', 'claudeai');
    expect(fake.args()).toEqual(['mcp', 'remove', 'claude.ai Gmail']);
  });

  it('says so when the CLI is missing', async () => {
    const control = new ClaudeControl('no-such-claude-cli', fakeQuery([STATUSES]).fn);
    await expect(control.connectors('/a')).rejects.toThrow('Claude Code CLI not found');
  });
});

describe('connector routes', () => {
  async function app(folder: string | null) {
    const { fn, log } = fakeQuery([STATUSES]);
    const fake = recordingClaude();
    const server = Fastify();
    const stateDir = tempDir();
    registerConnectorRoutes(
      server,
      { folder },
      stateDir,
      (req) => req.headers.authorization === 'Bearer t',
      new ClaudeControl(fake.bin, fn),
    );
    await server.ready();
    const call = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) =>
      server.inject({ method, url, payload, headers: { authorization: 'Bearer t' } });
    return { server, call, log, fake, stateDir };
  }

  it('needs the token', async () => {
    const { server } = await app(null);
    expect((await server.inject({ method: 'GET', url: '/api/ceo/connectors' })).statusCode).toBe(
      401,
    );
  });

  it('lists commands and connectors in the CEO folder', async () => {
    const project = tempDir();
    const { call, log } = await app(project);
    const commands = await call('GET', '/api/ceo/commands');
    expect(commands.json().commands).toHaveLength(3);
    const listed = await call('GET', '/api/ceo/connectors');
    expect(listed.json().project).toBe(project);
    expect(listed.json().connectors).toHaveLength(4);
    expect(log.queries.map((q) => q.cwd)).toEqual([project, project]);
  });

  it('uses the CEO folder without a project, and refuses Off there', async () => {
    const { call, log, stateDir } = await app(null);
    await call('GET', '/api/ceo/connectors');
    expect(log.queries[0].cwd).toBe(path.join(stateDir, 'cat-ceo'));
    const off = await call('POST', '/api/ceo/connectors/old/toggle', { enabled: false });
    expect(off.statusCode).toBe(400);
    expect(off.json().error).toBe('Pick a project first');
  });

  it('adds with a checked name and removes by source', async () => {
    const { call, fake } = await app(tempDir());
    const bad = await call('POST', '/api/ceo/connectors', {
      name: '--evil',
      target: 'x',
      scope: 'user',
    });
    expect(bad.statusCode).toBe(400);
    const added = await call('POST', '/api/ceo/connectors', {
      name: 'files',
      target: 'https://files.example/mcp',
      scope: 'user',
    });
    expect(added.statusCode).toBe(200);
    expect(fake.args()).toContain('https://files.example/mcp');
    const removed = await call('DELETE', '/api/ceo/connectors/old?source=local');
    expect(removed.statusCode).toBe(200);
    expect(fake.args()).toEqual(['mcp', 'remove', 'old', '--scope', 'local']);
  });

  it('turns a server off for the project', async () => {
    const { call, log } = await app(tempDir());
    const off = await call(
      'POST',
      `/api/ceo/connectors/${encodeURIComponent('claude.ai Gmail')}/toggle`,
      {
        enabled: false,
      },
    );
    expect(off.statusCode).toBe(200);
    expect(log.toggles).toEqual([['claude.ai Gmail', false]]);
  });
});

describe('slash commands in the CEO chat', () => {
  type Part = DeskState['pending'][number];
  const user = (text: string): Part => ({ kind: 'user', text });
  const notice = (text: string): Part => ({ kind: 'notice', text }) as Part;

  it('a slash command is a turn of its own', () => {
    const queue = [
      user('/compact'),
      user('hi'),
      notice('[Job 1 done]'),
      user('/tidy-notes x'),
      user('bye'),
    ];
    expect(takeTurnParts(queue)).toEqual([user('/compact')]);
    expect(takeTurnParts(queue)).toEqual([user('hi'), notice('[Job 1 done]')]);
    expect(takeTurnParts(queue)).toEqual([user('/tidy-notes x')]);
    expect(takeTurnParts(queue)).toEqual([user('bye')]);
    expect(queue).toEqual([]);
  });

  it('a compact boundary is a quiet row, and the context shrinks', () => {
    const rows: CatSessionEntry[] = [];
    const contexts: ContextUse[] = [];
    const stream = new DeskStream({
      add: (entry) => (rows.push(entry), { ...entry, at: rows.length }) as DeskRow,
      update: () => {},
      saveImages: () => [],
      context: (use) => contexts.push(use),
      folders: [],
    });
    stream.line(
      JSON.stringify({
        type: 'system',
        subtype: 'compact_boundary',
        compact_metadata: { trigger: 'manual', pre_tokens: 90000, post_tokens: 12000 },
      }),
    );
    expect(rows).toEqual([{ kind: 'note', text: 'Summarised the chat' }]);
    expect(contexts).toEqual([{ used: 12000, window: 200000 }]);
  });
});
