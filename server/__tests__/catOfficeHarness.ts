/**
 * Test harness for the cat office: a fake `claude` that speaks stream-json and
 * calls the office MCP tools over HTTP like the real CLI, plus a fake host.
 *
 * Fake behaviour (from the turn's user message):
 * - "[Task from the user" with "Your direct reports:": brief, then delegate
 *   "write <id>.txt" to every listed report.
 * - "[Task from" (a delegation): write <catId>.txt in its cwd, then report.
 * - "[Report from" or "[Office] Your turn ended": the root reports the
 *   final result (the office refuses while workers still work).
 * - FAKE_MODE=hang: never answer (for interrupt tests); FAKE_HANG_CAT=<id>: only that cat hangs.
 * It speaks the Agent SDK protocol (claudeAdapter.ts): the persona comes in
 * the initialize request, the MCP config as inline JSON.
 * Every run appends {cat, args, cwd, message, persona, compactWindow} to $FAKE_LOG.
 */

import * as fs from 'fs';
import * as path from 'path';

import type { ToolActivity } from '../src/orchestrator/engineAdapter.js';
import type { CatAgentHost } from '../src/orchestrator/orchestrator.js';

export const FAKE_CAT_CLAUDE = `#!/usr/bin/env node
const fs = require('fs');
// The SDK passes --session-id=<id> and --resume=<id>; the log keeps the two-word form.
const args = process.argv.slice(2).flatMap((a) => {
  const m = /^(--session-id|--resume)=(.*)$/.exec(a);
  return m ? [m[1], m[2]] : [a];
});
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
if (args[0] === '--help') {
  process.stdout.write("  --effort <level>   Effort level (low, medium, high, xhigh, max)\\n  --model <model>   Model alias (e.g. 'fable', 'opus', or 'sonnet') or a model's full name.\\n  -n, --name <name>  x\\n");
  process.exit(0);
}
// The engine status probe (engineStatus.ts): installed and logged in.
if (args[0] === '--version') { process.stdout.write('2.1.291 (Claude Code)\\n'); process.exit(0); }
// FAKE_MODE=loggedout: \`claude auth status\` as a fresh machine prints it (exit 1).
if (args[0] === 'auth') {
  const out = process.env.FAKE_MODE === 'loggedout';
  process.stdout.write(out ? '{"loggedIn": false, "authMethod": "none"}\\n' : '{"loggedIn": true, "authMethod": "claude.ai"}\\n');
  process.exit(out ? 1 : 0);
}
// The Agent SDK protocol: control requests (initialize carries the persona)
// get a success; the user message runs the turn; stdin EOF ends the process.
let buf = '';
let persona = '';
let running = Promise.resolve();
process.stdin.on('data', (d) => {
  buf += d;
  const lines = buf.split('\\n');
  buf = lines.pop();
  for (const line of lines.filter(Boolean)) {
    const m = JSON.parse(line);
    if (m.type === 'control_request') {
      if (m.request.subtype === 'initialize') persona = m.request.appendSystemPrompt || '';
      process.stdout.write(JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: m.request_id, response: {} } }) + '\\n');
    } else if (m.type === 'user') running = turn(m.message.content);
  }
});
// Like the real CLI: EOF ends the process once the running turn is done.
process.stdin.on('end', () => running.then(() => process.exit(0)));
const turn = async (message) => {
  const cat = /cat id is "([a-z0-9-]+)"/.exec(persona)[1];
  const sessionId = flag('--session-id') || flag('--resume');
  const compactWindow = process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW;
  fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ cat, args, cwd: process.cwd(), message, persona, compactWindow }) + '\\n');
  if (process.env.FAKE_MODE === 'hang' || process.env.FAKE_HANG_CAT === cat) return new Promise(() => {});
  // FAKE_MODE=authfail / loggedout: the headless turn of a logged-out CLI (recorded 2026-10-06).
  if (process.env.FAKE_MODE === 'authfail' || process.env.FAKE_MODE === 'loggedout') {
    const nope = 'Not logged in · Please run /login';
    process.stdout.write(JSON.stringify({ type: 'assistant', session_id: sessionId, error: 'authentication_failed', message: { content: [{ type: 'text', text: nope }] } }) + '\\n');
    process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: nope, session_id: sessionId, total_cost_usd: 0 }) + '\\n');
    process.exit(1);
  }
  const mcp = JSON.parse(flag('--mcp-config')).mcpServers.office;
  let rpcId = 0;
  const rpc = async (method, params) => {
    const res = await fetch(mcp.url, {
      method: 'POST',
      headers: { ...mcp.headers, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
    });
    return res.json();
  };
  const tool = async (name, args) => (await rpc('tools/call', { name, arguments: args })).result;
  const out = (o) => process.stdout.write(JSON.stringify({ session_id: sessionId, ...o }) + '\\n');
  out({ type: 'system', subtype: 'init', cwd: process.cwd() });
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'fake' } });
  let text = 'ok';
  if (message.includes('[Task from the user') && message.includes('Your direct reports:')) {
    await tool('brief', { plan: 'each worker writes one file' });
    const ids = [...message.matchAll(/^- .* \\(([a-z0-9-]+)\\):/gm)].map((m) => m[1]);
    for (const id of ids) await tool('delegate', { to: id, task: 'write ' + id + '.txt' });
    text = 'delegated';
  } else if (message.includes('[Task from')) {
    fs.writeFileSync(cat + '.txt', 'meow from ' + cat + '\\n');
    out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Write', input: { file_path: cat + '.txt' } }] } });
    await tool('report', { result: 'wrote ' + cat + '.txt' });
    text = 'reported';
  } else if (message.includes('[Report from') || message.includes('[Office] Your turn ended')) {
    const r = await tool('report', { result: 'all files are in: ' + fs.readdirSync('.').filter((f) => f.endsWith('.txt')).sort().join(', ') });
    text = r.isError ? 'waiting' : 'final';
  }
  const turns = Number(process.env.FAKE_TURN_COST || '0.01');
  const resumed = args.includes('--resume');
  out({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
  out({
    type: 'result', subtype: 'success', is_error: false, result: text,
    total_cost_usd: resumed ? turns * 2 : turns, duration_ms: 5, num_turns: 1,
    usage: { input_tokens: 3, cache_read_input_tokens: resumed ? 9000 : 0, cache_creation_input_tokens: resumed ? 50 : 9000, output_tokens: 7 },
  });
};
`;

export class FakeCatHost implements CatAgentHost {
  /** Resident characters: one per cat profile, by spawn order (id = index + 1). */
  spawned: Array<{ id: number; palette?: number }> = [];
  turns: Array<{ id: number; sessionId: string; cwd: string }> = [];
  ended: number[] = [];
  activity: Array<{ id: number; activity: ToolActivity }> = [];
  linked: Array<{ id: number; taskId: string }> = [];
  removed: number[] = [];
  restored: Array<{ sessionId: string; taskId: string }> = [];
  spawnResidentAgent(look?: { palette?: number }) {
    const id = this.spawned.length + 1;
    this.spawned.push({ id, palette: look?.palette });
    return id;
  }
  beginResidentTurn(id: number, sessionId: string, cwd: string) {
    this.turns.push({ id, sessionId, cwd });
  }
  endResidentTurn(id: number) {
    this.ended.push(id);
  }
  residentToolActivity(id: number, activity: ToolActivity) {
    this.activity.push({ id, activity });
  }
  linkAgentTask(id: number, taskId: string) {
    this.linked.push({ id, taskId });
  }
  removeResidentAgent(id: number) {
    this.removed.push(id);
  }
  // Task board host (plain runs).
  launchHeadlessAgent() {
    return { id: 99 };
  }
  finishHeadlessAgent() {}
  resumeHeadlessAgent() {}
  restoreFinishedAgent(sessionId: string, _cwd: string, taskId: string) {
    this.restored.push({ sessionId, taskId });
    return { id: 98 };
  }
}

export function writeFakeClaude(dir: string): string {
  const bin = path.join(dir, 'fake-claude');
  fs.writeFileSync(bin, FAKE_CAT_CLAUDE, { mode: 0o755 });
  return bin;
}

export interface FakeRun {
  cat: string;
  args: string[];
  cwd: string;
  message: string;
  persona: string;
  compactWindow?: string;
}

export function readFakeLog(file: string): FakeRun[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as FakeRun);
}

export async function waitFor<T>(check: () => T | undefined, timeoutMs = 15_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = check();
    if (value !== undefined) return value;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
}
