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
 * - FAKE_MODE=hang: never answer (for interrupt tests).
 * Every run appends {cat, args, cwd, message} to $FAKE_LOG.
 */

import * as fs from 'fs';
import * as path from 'path';

import type { CatAgentHost } from '../src/orchestrator/orchestrator.js';

export const FAKE_CAT_CLAUDE = `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
if (args[0] === '--help') {
  process.stdout.write("  --effort <level>   Effort level (low, medium, high, xhigh, max)\\n  --model <model>   Model alias (e.g. 'fable', 'opus', or 'sonnet') or a model's full name.\\n  -n, --name <name>  x\\n");
  process.exit(0);
}
let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', async () => {
  const message = JSON.parse(input.trim().split('\\n')[0]).message.content;
  const persona = fs.readFileSync(flag('--append-system-prompt-file'), 'utf-8');
  const cat = /cat id is "([a-z0-9-]+)"/.exec(persona)[1];
  const sessionId = flag('--session-id') || flag('--resume');
  fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ cat, args, cwd: process.cwd(), message }) + '\\n');
  if (process.env.FAKE_MODE === 'hang') return setInterval(() => {}, 1000);
  const mcp = JSON.parse(fs.readFileSync(flag('--mcp-config'), 'utf-8')).mcpServers.office;
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
});
`;

export class FakeCatHost implements CatAgentHost {
  launched: Array<{ id: number; sessionId: string; cwd: string; palette?: number }> = [];
  finished: Array<{ id: number; taskId: string }> = [];
  active: Array<{ id: number; active: boolean }> = [];
  removed: number[] = [];
  launchHeadlessAgent(sessionId: string, cwd: string, look?: { palette?: number }) {
    const id = this.launched.length + 1;
    this.launched.push({ id, sessionId, cwd, palette: look?.palette });
    return { id, palette: look?.palette, hueShift: 0 };
  }
  finishHeadlessAgent(id: number, taskId: string) {
    this.finished.push({ id, taskId });
  }
  setHeadlessAgentActive(id: number, active: boolean) {
    this.active.push({ id, active });
  }
  resumeHeadlessAgent() {}
  removeAgent(id: number) {
    this.removed.push(id);
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
