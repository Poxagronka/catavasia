import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import type { PermissionMode } from '../../core/src/messages.js';
import {
  ClaudeAdapter,
  claudeTurnOptions,
  resolveExecutable,
} from '../src/orchestrator/claudeAdapter.js';
import { claudeUserMessage } from '../src/orchestrator/claudeSession.js';
import type {
  PermissionAnswer,
  PermissionAsk,
  TurnRequest,
} from '../src/orchestrator/engineAdapter.js';

const PNG = Buffer.from('89504e470d0a1a0a0000', 'hex');

let tmp: string | undefined;
afterEach(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
});

function makeTmp(): string {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-claude-')));
  return tmp;
}

const req = (over: Partial<TurnRequest> = {}): TurnRequest => ({
  sessionId: 'sid',
  resume: false,
  cwd: '/w',
  model: 'opus',
  systemPromptFile: '/p.md',
  mcpConfigFile: '/m.json',
  message: 'hi',
  ...over,
});

describe('claudeTurnOptions', () => {
  const files = (mcp = { office: { type: 'http', url: 'http://h/mcp' } }) => {
    const dir = makeTmp();
    fs.writeFileSync(path.join(dir, 'p.md'), 'You are Luna.');
    fs.writeFileSync(path.join(dir, 'm.json'), JSON.stringify({ mcpServers: mcp }));
    return {
      cwd: dir,
      systemPromptFile: path.join(dir, 'p.md'),
      mcpConfigFile: path.join(dir, 'm.json'),
    };
  };

  it('is plain Claude Code with the persona appended and every setting source', () => {
    const opts = claudeTurnOptions(req({ ...files(), effort: 'high' }), '/bin/claude');
    expect(opts).toMatchObject({
      pathToClaudeCodeExecutable: '/bin/claude',
      sessionId: 'sid',
      model: 'opus',
      effort: 'high',
      systemPrompt: { type: 'preset', preset: 'claude_code', append: 'You are Luna.' },
      settingSources: ['user', 'project', 'local'],
      mcpServers: { office: { type: 'http', url: 'http://h/mcp' } },
      permissionMode: 'auto',
    });
    // No extra limits: the user's MCP servers stay, no denied tools, no budget.
    expect(opts.strictMcpConfig).toBeUndefined();
    expect(opts.disallowedTools).toBeUndefined();
    expect(opts.maxBudgetUsd).toBeUndefined();
    expect(claudeTurnOptions(req({ ...files(), resume: true }), 'c')).toMatchObject({
      resume: 'sid',
    });
    // Only a turn that shows its text live (the CEO) asks for partial messages.
    expect(opts.includePartialMessages).toBeUndefined();
    const live = claudeTurnOptions(req({ ...files(), partialText: true }), 'c');
    expect(live.includePartialMessages).toBe(true);
  });

  it('maps each mode; Auto on a model without it runs as Bypass', () => {
    const mode = (permissionMode: PermissionMode, model = 'opus') =>
      claudeTurnOptions(req({ ...files(), permissionMode, model }), 'c');
    expect(mode('ask')).toMatchObject({ permissionMode: 'default' });
    expect(mode('ask').canUseTool).toBeTypeOf('function');
    expect(mode('bypass')).toMatchObject({
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
    });
    expect(mode('bypass').canUseTool).toBeUndefined();
    // Read only: Claude Code denies all but reads; the office tools and web reads stay.
    expect(mode('readOnly')).toMatchObject({
      permissionMode: 'dontAsk',
      allowedTools: ['WebFetch', 'WebSearch', 'mcp__office'],
    });
    expect(mode('auto', 'haiku')).toMatchObject({ permissionMode: 'bypassPermissions' });
    expect(mode('auto', 'claude-sonnet-4-6')).toMatchObject({ permissionMode: 'auto' });
    // Accept edits and Plan mode are the SDK's own modes; both keep the questions.
    expect(mode('acceptEdits')).toMatchObject({ permissionMode: 'acceptEdits' });
    expect(mode('acceptEdits').canUseTool).toBeTypeOf('function');
    expect(mode('plan')).toMatchObject({ permissionMode: 'plan' });
    expect(mode('plan').canUseTool).toBeTypeOf('function');
    expect(mode('readOnly').canUseTool).toBeUndefined();
  });

  it('answers ExitPlanMode with each plan choice: Approve switches the mode, Keep planning denies', async () => {
    let answer: PermissionAnswer = { mode: 'acceptEdits' };
    const opts = claudeTurnOptions(req({ ...files(), askPermission: async () => answer }), 'c');
    const base = { signal: new AbortController().signal, toolUseID: 't', requestId: 'r' };
    const input = { plan: '1. Write hello.txt', planFilePath: '/p/plan.md' };
    const setMode = (mode: string) => [{ type: 'setMode', mode, destination: 'session' }];
    expect(await opts.canUseTool!('ExitPlanMode', input, base)).toEqual({
      behavior: 'allow',
      updatedInput: input,
      updatedPermissions: setMode('acceptEdits'),
    });
    answer = { mode: 'ask' };
    expect(await opts.canUseTool!('ExitPlanMode', input, base)).toEqual({
      behavior: 'allow',
      updatedInput: input,
      updatedPermissions: setMode('default'),
    });
    answer = { keepPlanning: '  Add a test step. ' };
    expect(await opts.canUseTool!('ExitPlanMode', input, base)).toEqual({
      behavior: 'deny',
      message: 'The user did not approve the plan. Keep planning: Add a test step.',
    });
    answer = { keepPlanning: '' };
    expect(await opts.canUseTool!('ExitPlanMode', input, base)).toEqual({
      behavior: 'deny',
      message: 'The user did not approve the plan. Keep planning.',
    });
  });

  it("opens Take the wheel in the cat's permission mode (claude --help: --permission-mode)", () => {
    const wheel = (mode: PermissionMode) =>
      new ClaudeAdapter('claude').interactiveResumeCommand('sid', mode);
    expect(wheel('auto')).toEqual({
      command: 'claude',
      args: ['--resume', 'sid', '--permission-mode', 'auto'],
    });
    expect(wheel('ask').args).toEqual(['--resume', 'sid', '--permission-mode', 'default']);
    expect(wheel('bypass').args).toEqual(['--resume', 'sid', '--dangerously-skip-permissions']);
    expect(wheel('plan').args).toEqual(['--resume', 'sid', '--permission-mode', 'plan']);
    expect(wheel('readOnly').args).toEqual([
      '--resume',
      'sid',
      '--permission-mode',
      'dontAsk',
      '--allowedTools',
      'WebFetch,WebSearch',
    ]);
  });

  it("puts the user's answers to AskUserQuestion into the tool input (SDK AskUserQuestionInput.answers)", async () => {
    const opts = claudeTurnOptions(
      req({ ...files(), askPermission: async () => ({ answers: { 'Which color?': 'Blue' } }) }),
      'c',
    );
    const base = { signal: new AbortController().signal, toolUseID: 't', requestId: 'r' };
    const input = { questions: [{ question: 'Which color?' }] };
    expect(await opts.canUseTool!('AskUserQuestion', input, base)).toEqual({
      behavior: 'allow',
      updatedInput: { ...input, answers: { 'Which color?': 'Blue' } },
    });
  });

  it('asks the user through askPermission, never for the office tools', async () => {
    const asked: string[] = [];
    const opts = claudeTurnOptions(
      req({
        ...files(),
        askPermission: async (ask) => {
          asked.push(`${ask.toolName}:${ask.canAlwaysAllow}`);
          return ask.toolName === 'Bash' ? 'always' : 'deny';
        },
      }),
      'c',
    );
    const signal = new AbortController().signal;
    const base = { signal, toolUseID: 't', requestId: 'r' };
    const suggestions = [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }] as never;
    expect(await opts.canUseTool!('mcp__office__report', { result: 'x' }, base)).toEqual({
      behavior: 'allow',
      updatedInput: { result: 'x' },
    });
    expect(await opts.canUseTool!('Bash', { command: 'ls' }, { ...base, suggestions })).toEqual({
      behavior: 'allow',
      updatedInput: { command: 'ls' },
      updatedPermissions: suggestions,
    });
    expect(await opts.canUseTool!('Write', {}, base)).toMatchObject({ behavior: 'deny' });
    expect(asked).toEqual(['Bash:true', 'Write:false']);
  });
});

describe('claudeTurnOptions project context', () => {
  const project = (extra: Record<string, string>) => {
    const dir = makeTmp();
    const all = { 'p.md': 'Persona.', 'm.json': '{"mcpServers":{}}', ...extra };
    for (const [name, text] of Object.entries(all)) fs.writeFileSync(path.join(dir, name), text);
    return dir;
  };
  const appended = (cwd: string) => {
    const opts = claudeTurnOptions(
      req({
        cwd,
        systemPromptFile: path.join(cwd, 'p.md'),
        mcpConfigFile: path.join(cwd, 'm.json'),
      }),
      'c',
    );
    return (opts.systemPrompt as { append: string }).append;
  };

  it('appends AGENTS.md when the project CLAUDE.md does not import it', () => {
    const cwd = project({ 'CLAUDE.md': 'Use tabs.', 'AGENTS.md': 'Say PINEAPPLE.' });
    expect(appended(cwd)).toBe('Persona.\n\nProject instructions (AGENTS.md):\n\nSay PINEAPPLE.');
  });

  it('leaves AGENTS.md to Claude Code when there is no CLAUDE.md or it imports AGENTS.md', () => {
    expect(appended(project({ 'AGENTS.md': 'x' }))).toBe('Persona.');
    expect(appended(project({ 'CLAUDE.md': '@AGENTS.md', 'AGENTS.md': 'x' }))).toBe('Persona.');
  });
});

describe('claudeUserMessage', () => {
  it('is plain text without images', () => {
    expect(claudeUserMessage('hi')).toEqual({
      type: 'user',
      message: { role: 'user', content: 'hi' },
      parent_tool_use_id: null,
    });
  });

  it('is text then one base64 image block per image', () => {
    const dir = makeTmp();
    fs.writeFileSync(path.join(dir, 'a.png'), PNG);
    fs.writeFileSync(path.join(dir, 'b.jpg'), PNG);
    const content = claudeUserMessage('look', [path.join(dir, 'a.png'), path.join(dir, 'b.jpg')])
      .message.content as unknown as Array<Record<string, unknown>>;
    expect(content[0]).toEqual({ type: 'text', text: 'look' });
    expect(content.slice(1).map((c) => (c.source as { media_type: string }).media_type)).toEqual([
      'image/png',
      'image/jpeg',
    ]);
    expect(content[1].source).toMatchObject({ type: 'base64', data: PNG.toString('base64') });
  });
});

describe('ClaudeAdapter.spawnTurn', () => {
  /**
   * A fake CLI that speaks the Agent SDK protocol: it answers the control
   * requests, saves argv and the user message, asks can_use_tool for a Bash
   * call when FAKE_ASK is set, and ends the turn with the answer it got.
   */
  const FAKE = `#!/usr/bin/env node
const fs = require('fs');
const dir = __dirname;
fs.writeFileSync(dir + '/argv.json', JSON.stringify(process.argv.slice(2)));
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
let buf = '';
let running = Promise.resolve();
let answered;
process.stdin.on('data', (d) => {
  buf += d;
  const lines = buf.split('\\n');
  buf = lines.pop();
  for (const line of lines.filter(Boolean)) {
    const m = JSON.parse(line);
    if (m.type === 'control_request') out({ type: 'control_response', response: { subtype: 'success', request_id: m.request_id, response: {} } });
    if (m.type === 'control_response') answered(m.response.response);
    if (m.type === 'user') running = turn(m);
  }
});
process.stdin.on('end', () => running.then(() => process.exit(0)));
async function turn(m) {
  fs.writeFileSync(dir + '/stdin.json', JSON.stringify(m));
  out({ type: 'system', subtype: 'init', session_id: 's' });
  let text = 'Red.';
  if (process.env.FAKE_ASK) {
    const reply = new Promise((r) => (answered = r));
    out({ type: 'control_request', request_id: 'ask1', request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'rm -rf build' }, tool_use_id: 'tu1', permission_suggestions: [{ type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'allow', destination: 'localSettings' }] } });
    text = JSON.stringify(await reply);
  }
  out({ type: 'result', subtype: 'success', is_error: false, result: text, session_id: 's' });
}
`;
  const fakeCli = (dir: string) => {
    const bin = path.join(dir, 'claude');
    fs.writeFileSync(bin, FAKE, { mode: 0o755 });
    fs.writeFileSync(path.join(dir, 'p.md'), 'Persona.');
    fs.writeFileSync(path.join(dir, 'm.json'), '{"mcpServers":{}}');
    return bin;
  };
  const files = (dir: string) => ({
    cwd: dir,
    systemPromptFile: path.join(dir, 'p.md'),
    mcpConfigFile: path.join(dir, 'm.json'),
  });
  afterEach(() => {
    delete process.env.FAKE_ASK;
  });

  it('drives the installed CLI through the SDK and sends the image blocks', async () => {
    const dir = makeTmp();
    const image = path.join(dir, 'red.png');
    fs.writeFileSync(image, PNG);
    const bin = fakeCli(dir);
    const outcome = await new ClaudeAdapter(bin).spawnTurn(
      req({ ...files(dir), images: [image], addDirs: ['/chat'], permissionMode: 'bypass' }),
    ).done;
    expect(outcome).toMatchObject({ ok: true, text: 'Red.', sessionStarted: true });
    const sent = JSON.parse(fs.readFileSync(path.join(dir, 'stdin.json'), 'utf-8'));
    expect(sent.message.content.map((c: { type: string }) => c.type)).toEqual(['text', 'image']);
    const argv = JSON.parse(fs.readFileSync(path.join(dir, 'argv.json'), 'utf-8')) as string[];
    expect(argv).toEqual(expect.arrayContaining(['--add-dir', '/chat', '--session-id=sid']));
    expect(argv[argv.indexOf('--permission-mode') + 1]).toBe('bypassPermissions');
    expect(argv).not.toContain('--strict-mcp-config');
  });

  it('turns a can_use_tool question into askPermission and sends the answer back', async () => {
    const dir = makeTmp();
    process.env.FAKE_ASK = '1';
    const asks: PermissionAsk[] = [];
    const outcome = await new ClaudeAdapter(fakeCli(dir)).spawnTurn(
      req({
        ...files(dir),
        permissionMode: 'ask',
        askPermission: async (ask) => {
          asks.push(ask);
          return 'always';
        },
      }),
    ).done;
    expect(asks).toHaveLength(1);
    expect(asks[0]).toMatchObject({
      toolName: 'Bash',
      input: { command: 'rm -rf build' },
      canAlwaysAllow: true,
    });
    expect(JSON.parse(outcome.text!)).toMatchObject({
      behavior: 'allow',
      updatedPermissions: [{ type: 'addRules', destination: 'localSettings' }],
    });
  });

  it('says so when the CLI is not installed', async () => {
    const outcome = await new ClaudeAdapter('no-such-claude-bin').spawnTurn(req()).done;
    expect(outcome).toMatchObject({ ok: false, error: 'Claude Code CLI not found' });
  });
});

describe('resolveExecutable', () => {
  it('finds the CLI on PATH, with PATHEXT on Windows, and keeps a path as is', () => {
    const dir = makeTmp();
    fs.writeFileSync(path.join(dir, 'claude'), '', { mode: 0o755 });
    fs.writeFileSync(path.join(dir, 'claude.EXE'), '', { mode: 0o755 });
    fs.mkdirSync(path.join(dir, 'sub', 'claude'), { recursive: true });
    const PATH = [path.join(dir, 'sub'), dir].join(path.delimiter);
    expect(resolveExecutable('claude', { PATH }, 'darwin')).toBe(path.join(dir, 'claude'));
    fs.rmSync(path.join(dir, 'claude'));
    expect(resolveExecutable('claude', { PATH, PATHEXT: '.EXE' }, 'win32')).toBe(
      path.join(dir, 'claude.EXE'),
    );
    expect(resolveExecutable('claude', { PATH }, 'darwin')).toBeUndefined();
    expect(resolveExecutable('/opt/claude', {})).toBe('/opt/claude');
  });
});
