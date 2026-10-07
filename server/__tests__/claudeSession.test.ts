import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { ClaudeAdapter } from '../src/orchestrator/claudeAdapter.js';
import type {
  LiveSession,
  SessionRequest,
  TurnOutcome,
} from '../src/orchestrator/engineAdapter.js';
import { waitFor } from './catOfficeHarness.js';

/**
 * A fake CLI that speaks the Agent SDK protocol of an open input: it logs each
 * start (spawns.log), each user message and control request as it arrives
 * (events.log), and runs the messages one after another. A message with
 * "slow" runs until an interrupt; "die" ends the process with an error;
 * "suggest" sends a prompt suggestion after the result; "approve" switches
 * the mode to acceptEdits, as an approved plan does (a status line). With the env flag of
 * claudeSession.ts it reports its state (running, idle) like CLI 2.1.293.
 */
const FAKE = `#!/usr/bin/env node
const fs = require('fs');
const dir = __dirname;
fs.appendFileSync(dir + '/spawns.log', JSON.stringify(process.argv.slice(2)) + '\\n');
const log = (o) => fs.appendFileSync(dir + '/events.log', JSON.stringify(o) + '\\n');
const out = (o) => process.stdout.write(JSON.stringify({ session_id: 's', ...o }) + '\\n');
const states = process.env.CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS === '1';
const state = (s) => states && out({ type: 'system', subtype: 'session_state_changed', state: s, uuid: 'u' });
let buf = '';
let queue = [];
let running = false;
let interrupted = () => {};
process.stdin.on('data', (d) => {
  buf += d;
  const lines = buf.split('\\n');
  buf = lines.pop();
  for (const line of lines.filter(Boolean)) {
    const m = JSON.parse(line);
    if (m.type === 'control_request') {
      log({ control: m.request.subtype, mode: m.request.mode, model: m.request.model, task: m.request.task_id, perTask: m.request.perTaskStopAffordance, todo: m.request.perTaskStopAffordance && process.env.CLAUDE_CODE_ENABLE_TODO_TOOLS });
      if (m.request.subtype === 'interrupt') interrupted();
      out({ type: 'control_response', response: { subtype: 'success', request_id: m.request_id, response: {} } });
    }
    if (m.type === 'user') {
      log({ user: m.message.content, busy: running });
      queue.push(m.message.content);
      if (!running) next();
    }
  }
});
process.stdin.on('end', () => process.exit(0));
async function next() {
  running = true;
  state('running');
  while (queue.length) {
    const text = queue.shift();
    out({ type: 'system', subtype: 'init', model: 'opus' });
    if (text.includes('die')) {
      process.stderr.write('boom');
      process.exit(3);
    }
    if (text.includes('slow')) {
      await new Promise((r) => (interrupted = r));
      out({ type: 'result', subtype: 'error_during_execution', is_error: true, errors: [] });
      continue;
    }
    if (text.includes('approve')) out({ type: 'system', subtype: 'status', status: null, permissionMode: 'acceptEdits', uuid: 'u' });
    out({ type: 'assistant', message: { content: [{ type: 'text', text: 'echo ' + text }] } });
    out({ type: 'result', subtype: 'success', is_error: false, result: 'echo ' + text, total_cost_usd: 0.01 });
  }
  running = false;
  state('idle');
  if (process.env.FAKE_SUGGEST) out({ type: 'prompt_suggestion', suggestion: 'Now blue?', uuid: 'u1' });
}
`;

let tmp: string | undefined;
let session: LiveSession | undefined;
afterEach(async () => {
  await session?.close();
  session = undefined;
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
  delete process.env.FAKE_SUGGEST;
});

interface Opened {
  dir: string;
  results: TurnOutcome[];
  busy: boolean[];
  suggestions: string[];
  spawns: () => string[][];
  events: () => Array<Record<string, unknown>>;
}

function open(over: Partial<SessionRequest> = {}): Opened {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-session-')));
  const dir = tmp;
  const bin = path.join(dir, 'claude');
  fs.writeFileSync(bin, FAKE, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'p.md'), 'Persona.');
  fs.writeFileSync(path.join(dir, 'm.json'), '{"mcpServers":{}}');
  const opened: Opened = {
    dir,
    results: [],
    busy: [],
    suggestions: [],
    spawns: () => readLines(path.join(dir, 'spawns.log')) as string[][],
    events: () => readLines(path.join(dir, 'events.log')) as Array<Record<string, unknown>>,
  };
  session = new ClaudeAdapter(bin).openSession({
    sessionId: 'sid',
    resume: false,
    cwd: dir,
    model: 'opus',
    permissionMode: 'ask',
    systemPromptFile: path.join(dir, 'p.md'),
    mcpConfigFile: path.join(dir, 'm.json'),
    askPermission: async () => 'allow',
    onResult: (outcome) => opened.results.push(outcome),
    onBusy: (busy) => opened.busy.push(busy),
    onSuggestion: (text) => opened.suggestions.push(text),
    ...over,
  });
  return opened;
}

function readLines(file: string): unknown[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}

const idle = (o: Opened, results: number) =>
  waitFor(() => (o.results.length >= results && o.busy.at(-1) === false ? true : undefined));

describe('ClaudeAdapter.openSession', () => {
  it('serves two messages with one process; busy ends at idle; the suggestion follows', async () => {
    process.env.FAKE_SUGGEST = '1';
    const o = open();
    session!.send('one');
    await idle(o, 1);
    session!.send('two');
    await idle(o, 2);
    expect(o.spawns()).toHaveLength(1);
    expect(o.results.map((r) => [r.ok, r.text])).toEqual([
      [true, 'echo one'],
      [true, 'echo two'],
    ]);
    expect(o.busy).toEqual([true, false, true, false]);
    await waitFor(() => (o.suggestions.length === 2 ? true : undefined));
    expect(o.suggestions[0]).toBe('Now blue?');
  });

  it('a message sent while Claude works reaches the live input at once', async () => {
    const o = open();
    session!.send('slow job');
    await waitFor(() => (o.events().length ? true : undefined));
    session!.send('and this too');
    const got = await waitFor(() => o.events().find((e) => e.user === 'and this too'));
    // The first turn still runs: the CLI decides (fold it in or run it next).
    expect(got.busy).toBe(true);
    expect(o.results).toHaveLength(0);
    await session!.interrupt();
    await idle(o, 2);
    expect(o.spawns()).toHaveLength(1);
  });

  it('Stop interrupts the turn and keeps the process for the next message', async () => {
    const o = open();
    session!.send('slow job');
    await waitFor(() => (o.events().length ? true : undefined));
    await session!.interrupt();
    await idle(o, 1);
    expect(o.results[0]).toMatchObject({ ok: false });
    session!.send('again');
    await idle(o, 2);
    expect(o.results[1]).toMatchObject({ ok: true, text: 'echo again' });
    expect(o.events().filter((e) => e.control === 'interrupt')).toHaveLength(1);
    expect(o.spawns()).toHaveLength(1);
  });

  it('declares the per-task stop and the to-do tools; a task stops by its id', async () => {
    const o = open();
    session!.send('hi');
    await idle(o, 1);
    await session!.stopTask('b3a1k73m9');
    const events = o.events();
    expect(events.find((e) => e.control === 'initialize')).toMatchObject({
      perTask: true,
      todo: '1',
    });
    expect(events.find((e) => e.control === 'stop_task')).toMatchObject({ task: 'b3a1k73m9' });
  });

  it('applies a mode or model change live; a move into Bypass needs a new process', async () => {
    const o = open();
    session!.send('one');
    await idle(o, 1);
    expect(session!.update({ model: 'opus', permissionMode: 'auto' })).toBe(true);
    expect(session!.update({ model: 'sonnet', permissionMode: 'auto' })).toBe(true);
    await waitFor(() => (o.events().some((e) => e.control === 'set_model') ? true : undefined));
    const controls = o.events().filter((e) => e.control?.toString().startsWith('set_'));
    expect(controls).toEqual([
      { control: 'set_permission_mode', mode: 'auto' },
      { control: 'set_model', model: 'sonnet' },
    ]);
    // Accept edits and Plan mode keep the questions: they apply live too.
    expect(session!.update({ model: 'sonnet', permissionMode: 'plan' })).toBe(true);
    expect(session!.update({ model: 'sonnet', permissionMode: 'acceptEdits' })).toBe(true);
    await waitFor(() => (o.events().some((e) => e.mode === 'acceptEdits') ? true : undefined));
    expect(
      o
        .events()
        .filter((e) => e.control === 'set_permission_mode')
        .map((e) => e.mode),
    ).toEqual(['auto', 'plan', 'acceptEdits']);
    expect(session!.update({ model: 'sonnet', permissionMode: 'readOnly' })).toBe(false);
    expect(session!.update({ model: 'sonnet', permissionMode: 'bypass' })).toBe(false);
    expect(session!.update({ model: 'sonnet', effort: 'max', permissionMode: 'auto' })).toBe(false);
    expect(o.spawns()).toHaveLength(1);
  });

  it("reports the CLI's own mode change once; the same mode then needs no switch", async () => {
    const modes: string[] = [];
    const o = open({ permissionMode: 'plan', onMode: (mode) => modes.push(mode) });
    session!.send('approve the plan');
    await idle(o, 1);
    expect(modes).toEqual(['acceptEdits']);
    expect(session!.update({ model: 'opus', permissionMode: 'acceptEdits' })).toBe(true);
    session!.send('approve again');
    await idle(o, 2);
    expect(modes).toEqual(['acceptEdits']);
    expect(o.events().some((e) => e.control === 'set_permission_mode')).toBe(false);
  });

  it('ends with the error when the process dies', async () => {
    const o = open();
    session!.send('die now');
    expect((await session!.ended).error).toContain('boom');
    expect(o.results).toHaveLength(0);
  });

  it('close ends the process and resolves after it is gone', async () => {
    const o = open();
    session!.send('slow job');
    await waitFor(() => (o.events().length ? true : undefined));
    await session!.close();
    expect((await session!.ended).error).toBeUndefined();
  });

  it('says so when the CLI is not installed', async () => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-session-')));
    fs.writeFileSync(path.join(tmp, 'm.json'), '{"mcpServers":{}}');
    fs.writeFileSync(path.join(tmp, 'p.md'), 'Persona.');
    session = new ClaudeAdapter('no-such-claude-bin').openSession({
      sessionId: 'sid',
      resume: false,
      cwd: tmp,
      model: 'opus',
      systemPromptFile: path.join(tmp, 'p.md'),
      mcpConfigFile: path.join(tmp, 'm.json'),
      onResult: () => {},
      onBusy: () => {},
    });
    expect(await session.ended).toEqual({
      error: 'Claude Code CLI not found',
      sessionStarted: false,
    });
  });
});
