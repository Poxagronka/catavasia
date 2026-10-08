/**
 * Codex engine: the event mapping over recorded real `codex exec --json`
 * output (fixtures/codex-exec-*.jsonl, codex-cli 0.155.1), the turn process
 * over a fake `codex` binary, and the per-cat adapter choice and gating.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { PermissionMode } from '../../core/src/messages.js';
import { ClaudeAdapter } from '../src/orchestrator/claudeAdapter.js';
import {
  CODEX_OFFICE_TOKEN_ENV,
  CodexAdapter,
  codexModeArgs,
  codexTurnArgs,
  parseCodexModels,
  tomlString,
} from '../src/orchestrator/codexAdapter.js';
import { type CodexLine, parseCodexLine, toolOf } from '../src/orchestrator/codexEvents.js';
import type { ToolActivity, TurnRequest } from '../src/orchestrator/engineAdapter.js';
import { Orchestrator } from '../src/orchestrator/orchestrator.js';
import { FakeCatHost, writeFakeClaude } from './catOfficeHarness.js';

const FIXTURES = path.join(__dirname, 'fixtures');
const fixture = (name: string) => path.join(FIXTURES, `codex-exec-${name}.jsonl`);

function parseFixture(name: string): CodexLine[] {
  const seen = new Set<string>();
  return fs
    .readFileSync(fixture(name), 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => parseCodexLine(line, seen));
}

const MODELS = JSON.stringify({
  models: [
    {
      slug: 'gpt-6-astra',
      visibility: 'list',
      supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }],
    },
    { slug: 'gpt-reserve', visibility: 'hide', supported_reasoning_levels: [{ effort: 'max' }] },
    { slug: 'gpt-6-luna', visibility: 'list', supported_reasoning_levels: [{ effort: 'xhigh' }] },
  ],
});

/** Fake `codex`: `debug models` prints MODELS; `exec` logs its call and replays FAKE_CODEX_REPLAY. */
const FAKE_CODEX = `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
if (args[0] === 'debug') { process.stdout.write(${JSON.stringify(MODELS)}); process.exit(0); }
let stdin = '';
process.stdin.on('data', (d) => (stdin += d));
process.stdin.on('end', () => {
  fs.writeFileSync(process.env.FAKE_CODEX_LOG, JSON.stringify({
    args, cwd: process.cwd(), stdin, token: process.env.${CODEX_OFFICE_TOKEN_ENV},
  }));
  process.stdout.write(fs.readFileSync(process.env.FAKE_CODEX_REPLAY, 'utf-8'));
  process.exit(Number(process.env.FAKE_CODEX_EXIT || 0));
});
`;

let tmp: string;
let fakeCodex: string;

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-codex-')));
  fakeCodex = path.join(tmp, 'fake-codex');
  fs.writeFileSync(fakeCodex, FAKE_CODEX, { mode: 0o755 });
  process.env.FAKE_CODEX_LOG = path.join(tmp, 'codex.log');
});

afterEach(() => {
  delete process.env.FAKE_CODEX_EXIT;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('codex exec --json mapping (recorded runs)', () => {
  it('maps a turn: thread id, text, shell and office tools, usage', () => {
    const lines = parseFixture('turn');
    expect(lines[0].threadId).toBe('01a11246-f623-7a71-a3f3-f9e65c4c9372');
    expect(lines.flatMap((l) => l.log)).toEqual([
      { kind: 'text', text: expect.stringContaining('read the README') },
      { kind: 'tool', name: 'Bash', text: expect.stringContaining('cat README.md') },
      { kind: 'tool', name: 'mcp__office__report', text: expect.stringContaining('meow') },
      { kind: 'text', text: expect.stringContaining('hello.txt') },
    ]);
    // Each tool shows on the cat once and ends once.
    expect(lines.flatMap((l) => l.activity)).toEqual([
      { toolId: 'item_1', toolName: 'Bash', status: expect.stringMatching(/^Running: cat/) },
      { toolId: 'item_1', done: true },
      { toolId: 'item_2', toolName: 'mcp__office__report', status: 'Using mcp__office__report' },
      { toolId: 'item_2', done: true },
    ]);
    const last = lines.at(-1)!;
    expect(last.turnCompleted).toBe(true);
    // OpenAI counts cached tokens inside input_tokens: 91346 - 67584.
    expect(last.usage).toEqual({
      inputTokens: 23762,
      cacheReadTokens: 67584,
      cacheCreationTokens: 0,
      outputTokens: 194,
    });
  });

  it('maps a resumed turn with a file edit to Write', () => {
    const lines = parseFixture('resume');
    expect(lines[0].threadId).toBe('01a1123e-0257-7ce1-9048-a6d216302ae6');
    expect(lines.flatMap((l) => l.log)).toEqual([
      { kind: 'tool', name: 'Write', text: '/tmp/repo/b.txt' },
      { kind: 'text', text: 'world' },
    ]);
    expect(lines.flatMap((l) => l.activity)[0]).toMatchObject({ status: 'Writing b.txt' });
  });

  it('maps a failed turn to the inner API error message', () => {
    const lines = parseFixture('failed');
    expect(lines.flatMap((l) => l.log)[0]).toMatchObject({ kind: 'error' });
    expect(lines.at(-1)!.error).toBe(
      "The 'no-such-model-x' model is not supported when using Codex with a ChatGPT account.",
    );
    expect(lines.some((l) => l.turnCompleted)).toBe(false);
  });

  it('shows a plain read or search command as reading, a chain as running', () => {
    const cmd = (command: string) => toolOf({ type: 'command_execution', command });
    expect(cmd(`/bin/zsh -lc "sed -n '1,120p' src/a.ts"`)).toEqual({
      name: 'Read',
      input: { file_path: 'src/a.ts' },
    });
    expect(cmd(`/bin/zsh -lc 'rg -n foo src'`)?.name).toBe('Grep');
    expect(cmd(`/bin/zsh -lc "cat a.txt && echo x >> a.txt"`)?.name).toBe('Bash');
    expect(cmd('npm test')?.name).toBe('Bash');
  });
});

describe('codex adapter', () => {
  it('reads models and efforts from `codex debug models` (listed models only)', () => {
    expect(parseCodexModels(MODELS)).toEqual({
      models: ['gpt-6-astra', 'gpt-6-luna'],
      efforts: ['low', 'high', 'xhigh'],
    });
    expect(new CodexAdapter(fakeCodex).choices().models).toEqual(['gpt-6-astra', 'gpt-6-luna']);
  });

  it('builds new-session and resume args with the office MCP server and the persona', () => {
    const req = { sessionId: 'abc', resume: false, model: 'gpt-6-luna', effort: 'low' };
    const fresh = codexTurnArgs(req as TurnRequest, 'Be "Kodi"\nmeow', 'http://h/mcp');
    expect(fresh.slice(0, 2)).toEqual(['exec', '--json']);
    // No mode: Auto (Codex's own reviewer answers, workspace-write sandbox).
    expect(fresh).toContain('approvals_reviewer="auto_review"');
    expect(fresh).not.toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(fresh).toContain('--ignore-user-config');
    expect(fresh).toContain(`developer_instructions=${tomlString('Be "Kodi"\nmeow')}`);
    expect(fresh).toContain('mcp_servers.office.url="http://h/mcp"');
    expect(fresh).toContain(`mcp_servers.office.bearer_token_env_var="${CODEX_OFFICE_TOKEN_ENV}"`);
    expect(fresh.at(-1)).toBe('-');
    const resumed = codexTurnArgs({ ...req, resume: true } as TurnRequest, '', 'http://h/mcp');
    expect(resumed.slice(0, 4)).toEqual(['exec', 'resume', 'abc', '--json']);
    expect(tomlString('a\u007fb')).toBe('"a\\u007Fb"');
  });

  it('maps each permission mode to the closest Codex sandbox and approval policy', () => {
    const pairs = (mode: PermissionMode) => codexModeArgs(mode).filter((a) => a !== '-c');
    expect(codexModeArgs('bypass')).toEqual(['--dangerously-bypass-approvals-and-sandbox']);
    expect(pairs('auto')).toEqual([
      'sandbox_mode="workspace-write"',
      'approval_policy="on-request"',
      'approvals_reviewer="auto_review"',
    ]);
    expect(pairs('ask')).toEqual(['sandbox_mode="workspace-write"', 'approval_policy="never"']);
    expect(pairs('readOnly')).toEqual(['sandbox_mode="read-only"', 'approval_policy="never"']);
    // Codex has no plan mode or edit-only mode: the closest settings.
    expect(codexModeArgs('plan')).toEqual(codexModeArgs('readOnly'));
    expect(codexModeArgs('acceptEdits')).toEqual(codexModeArgs('ask'));
    // `codex exec resume` has no --sandbox flag: the mode rides on -c keys there too.
    const resumed = codexTurnArgs(
      { sessionId: 'abc', resume: true, model: 'm', permissionMode: 'readOnly' } as TurnRequest,
      '',
      'http://h/mcp',
    );
    expect(resumed).toContain('sandbox_mode="read-only"');
  });

  it('attaches each image with -i before the other flags (also on resume)', () => {
    const req = { sessionId: 'abc', resume: true, model: 'm', images: ['/a.png', '/b.jpg'] };
    const args = codexTurnArgs(req as TurnRequest, '', 'http://h/mcp');
    expect(args.slice(0, 8)).toEqual([
      'exec',
      'resume',
      'abc',
      '-i',
      '/a.png',
      '-i',
      '/b.jpg',
      '--json',
    ]);
    expect(args.at(-1)).toBe('-');
  });

  async function runTurn(replay: string, resume = false) {
    process.env.FAKE_CODEX_REPLAY = fixture(replay);
    const persona = path.join(tmp, 'kodi.md');
    const mcp = path.join(tmp, 'kodi.mcp.json');
    const adapter = new CodexAdapter(fakeCodex);
    fs.writeFileSync(persona, 'You are Kodi.');
    fs.writeFileSync(mcp, adapter.mcpConfig({ url: 'http://127.0.0.1:1/mcp', token: 'tok' }));
    const activity: ToolActivity[] = [];
    const logs: string[] = [];
    const outcome = await adapter.spawnTurn({
      sessionId: 'office-uuid',
      resume,
      cwd: tmp,
      model: 'gpt-6-luna',
      effort: 'low',
      systemPromptFile: persona,
      mcpConfigFile: mcp,
      message: 'do it',
      onLog: (e) => logs.push(e.kind),
      onActivity: (a) => activity.push(a),
    }).done;
    const call = JSON.parse(fs.readFileSync(process.env.FAKE_CODEX_LOG!, 'utf-8')) as {
      args: string[];
      cwd: string;
      stdin: string;
      token: string;
    };
    return { outcome, call, activity, logs };
  }

  it('runs a turn: message on stdin, token in the env, Codex session id in the outcome', async () => {
    const { outcome, call, activity, logs } = await runTurn('turn');
    expect(call).toMatchObject({ cwd: tmp, stdin: 'do it', token: 'tok' });
    expect(call.args).not.toContain('tok');
    expect(outcome).toMatchObject({
      ok: true,
      sessionStarted: true,
      sessionId: '01a11246-f623-7a71-a3f3-f9e65c4c9372',
      text: expect.stringContaining('hello.txt'),
    });
    expect(activity).toHaveLength(4);
    expect(logs).toEqual(['text', 'tool', 'tool', 'text']);
  });

  it('resumes the Codex session and reports a failed turn', async () => {
    const { call } = await runTurn('resume', true);
    expect(call.args.slice(0, 3)).toEqual(['exec', 'resume', 'office-uuid']);
    process.env.FAKE_CODEX_EXIT = '1';
    const { outcome } = await runTurn('failed');
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/no-such-model-x/);
  });

  it("opens the session in a terminal with `codex resume`, in the cat's permission mode", () => {
    const wheel = (mode: PermissionMode) =>
      new CodexAdapter('codex').interactiveResumeCommand('t1', mode);
    expect(wheel('bypass')).toEqual({
      command: 'codex',
      args: [
        'resume',
        't1',
        '--dangerously-bypass-approvals-and-sandbox',
        '-c',
        'check_for_update_on_startup=false',
      ],
    });
    expect(wheel('auto').args).toEqual([
      'resume',
      't1',
      ...codexModeArgs('auto'),
      '-c',
      'check_for_update_on_startup=false',
    ]);
    expect(wheel('readOnly').args).toContain('sandbox_mode="read-only"');
  });
});

describe('engine per cat', () => {
  const missing = '/nonexistent/bin';

  it('marks an engine whose CLI is not on PATH as unavailable', () => {
    expect(new CodexAdapter(`${missing}/codex`).choices().unavailable).toBe('Codex CLI not found');
    expect(new ClaudeAdapter(`${missing}/claude`).choices().unavailable).toBe(
      'Claude Code CLI not found',
    );
  });

  function office(codexBin: string): Orchestrator {
    const stateDir = path.join(tmp, `state-${path.basename(codexBin)}`);
    fs.mkdirSync(stateDir, { recursive: true });
    const cat = (id: string, engine: string, model: string, parentId: string | null) => ({
      id,
      name: id,
      role: '',
      engine,
      model,
      effort: engine === 'codex' ? 'low' : 'medium',
      appearance: { breed: 'leo' },
      parentId,
    });
    const cats = [
      cat('boss', 'claude', 'sonnet', null),
      cat('kodi', 'codex', 'gpt-6-luna', 'boss'),
    ];
    fs.writeFileSync(
      path.join(stateDir, 'cats.json'),
      JSON.stringify({ version: 1, cats, catCeo: { enabled: false } }),
    );
    return new Orchestrator({
      host: new FakeCatHost(),
      stateDir,
      adapters: [new ClaudeAdapter(writeFakeClaude(tmp)), new CodexAdapter(codexBin)],
      emit: () => {},
      turnConcurrency: 2,
    });
  }

  it('picks the adapter from profile.engine and offers Codex when its CLI is there', () => {
    const o = office(fakeCodex);
    expect(o.adapterFor(o.cats.get('kodi')!)).toBeInstanceOf(CodexAdapter);
    expect(o.adapterFor(o.cats.get('boss')!)).toBeInstanceOf(ClaudeAdapter);
    expect(o.targets().find((t) => t.id === 'kodi')?.disabled).toBeUndefined();
  });

  it('disables a Codex cat with "Codex CLI not found" when codex is missing', () => {
    const o = office(`${missing}/codex`);
    expect(o.adapterFor(o.cats.get('kodi')!)).toBeUndefined();
    expect(o.targets().find((t) => t.id === 'kodi')?.disabled).toBe('Codex CLI not found');
    const options = o.profileMessages()[0] as unknown as {
      engineOptions: Array<Record<string, unknown>>;
    };
    expect(options.engineOptions.find((e) => e.engine === 'codex')).toMatchObject({
      unavailable: 'Codex CLI not found',
    });
  });
});
