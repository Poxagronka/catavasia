import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ClaudeAdapter,
  claudeTurnArgs,
  claudeUserMessage,
} from '../src/orchestrator/claudeAdapter.js';
import type { TurnRequest } from '../src/orchestrator/engineAdapter.js';

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

describe('claudeTurnArgs', () => {
  it('keeps the office strict by default and puts extra args last', () => {
    const args = claudeTurnArgs(req({ effort: 'high', extraArgs: ['--add-dir', '/proj'] }));
    expect(args.slice(0, 8)).toEqual([
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--session-id',
      'sid',
    ]);
    expect(args).toContain('--strict-mcp-config');
    expect(args.slice(-3)).toEqual(['--dangerously-skip-permissions', '--add-dir', '/proj']);
  });

  it('omits --strict-mcp-config when the turn keeps the user MCP servers', () => {
    const args = claudeTurnArgs(req({ resume: true, userMcp: true }));
    expect(args).not.toContain('--strict-mcp-config');
    expect(args).toContain('--mcp-config');
    expect(args.slice(6, 8)).toEqual(['--resume', 'sid']);
  });
});

describe('claudeUserMessage', () => {
  it('is plain text without images', () => {
    expect(JSON.parse(claudeUserMessage('hi'))).toEqual({
      type: 'user',
      message: { role: 'user', content: 'hi' },
    });
  });

  it('is text then one base64 image block per image', () => {
    const dir = makeTmp();
    fs.writeFileSync(path.join(dir, 'a.png'), PNG);
    fs.writeFileSync(path.join(dir, 'b.jpg'), PNG);
    const line = claudeUserMessage('look', [path.join(dir, 'a.png'), path.join(dir, 'b.jpg')]);
    expect(line.endsWith('\n')).toBe(true);
    const content = JSON.parse(line).message.content;
    expect(content[0]).toEqual({ type: 'text', text: 'look' });
    expect(
      content.slice(1).map((c: { source: { media_type: string } }) => c.source.media_type),
    ).toEqual(['image/png', 'image/jpeg']);
    expect(content[1].source).toMatchObject({ type: 'base64', data: PNG.toString('base64') });
  });
});

describe('ClaudeAdapter.spawnTurn', () => {
  it('writes the image blocks to the CLI stdin', async () => {
    const dir = makeTmp();
    const image = path.join(dir, 'red.png');
    fs.writeFileSync(image, PNG);
    // A fake CLI: saves its stdin and argv, then prints a stream-json result.
    const bin = path.join(dir, 'claude');
    fs.writeFileSync(
      bin,
      `#!/usr/bin/env node
let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  require('fs').writeFileSync(${JSON.stringify(path.join(dir, 'stdin.json'))}, input);
  require('fs').writeFileSync(${JSON.stringify(path.join(dir, 'argv.json'))}, JSON.stringify(process.argv.slice(2)));
  console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'Red.', session_id: 's' }));
});
`,
      { mode: 0o755 },
    );
    const outcome = await new ClaudeAdapter(bin).spawnTurn(
      req({ cwd: dir, images: [image], userMcp: true, extraArgs: ['--max-budget-usd', '5'] }),
    ).done;
    expect(outcome).toMatchObject({ ok: true, text: 'Red.' });
    const sent = JSON.parse(fs.readFileSync(path.join(dir, 'stdin.json'), 'utf-8'));
    expect(sent.message.content.map((c: { type: string }) => c.type)).toEqual(['text', 'image']);
    const argv = JSON.parse(fs.readFileSync(path.join(dir, 'argv.json'), 'utf-8')) as string[];
    expect(argv).not.toContain('--strict-mcp-config');
    expect(argv.slice(-2)).toEqual(['--max-budget-usd', '5']);
  });
});
