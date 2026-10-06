/**
 * Claude Code engine adapter: one `claude -p` stream-json process per turn.
 *
 * The cat keeps the project settings (no --setting-sources), so it sees the
 * project CLAUDE.md and the user's hooks. Only the office MCP server is
 * attached (--strict-mcp-config). Permissions are skipped, as for board tasks.
 */

import { execFileSync, spawn } from 'child_process';

import { CAT_AUTO_COMPACT_WINDOW } from '../constants.js';
import { parseStreamLine, type StreamResult } from '../taskBoard/streamJson.js';
import type { EngineChoices } from './catProfiles.js';
import type {
  CompactInfo,
  EngineAdapter,
  OfficeMcpEndpoint,
  TurnHandle,
  TurnOutcome,
  TurnRequest,
} from './engineAdapter.js';

const STDERR_TAIL_CHARS = 2000;
/** `claude --help` says the CLI also takes "a model's full name". */
const FULL_MODEL_PATTERN = /^claude-[a-z0-9][a-z0-9.-]*$/;

/**
 * Read the model aliases and effort levels from `claude --help` text. The
 * `--model` entry quotes its aliases ('fable', 'opus', ...); the `--effort`
 * entry lists its levels in parentheses.
 */
export function parseClaudeHelp(help: string): EngineChoices {
  const entry = (flag: string): string => {
    const start = help.indexOf(`  ${flag} `);
    if (start < 0) return '';
    const rest = help.slice(start + flag.length + 2);
    const next = rest.search(/\n {2}-/);
    return (next < 0 ? rest : rest.slice(0, next)).replace(/\s+/g, ' ');
  };
  const models = [...entry('--model').matchAll(/'([a-z0-9][a-z0-9.-]*)'/g)].map((m) => m[1]);
  const levels = /\(([a-z, ]+)\)/.exec(entry('--effort'))?.[1] ?? '';
  const efforts = levels
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return { models, efforts, fullModelPattern: FULL_MODEL_PATTERN };
}

/**
 * The child env of a cat turn: auto-compact at a 200K window inside long
 * tasks (context-policy.md §4); the env var wins over every other setting.
 */
export function claudeTurnEnv(cwd: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PWD: cwd,
    CLAUDE_CODE_AUTO_COMPACT_WINDOW: String(CAT_AUTO_COMPACT_WINDOW),
  };
}

/** `{"type":"system","subtype":"compact_boundary","compact_metadata":{...}}` -> CompactInfo. */
export function parseCompactBoundary(line: string): CompactInfo | undefined {
  if (!line.includes('compact_boundary')) return undefined;
  try {
    const event = JSON.parse(line) as {
      type?: string;
      subtype?: string;
      compact_metadata?: { trigger?: string; pre_tokens?: number; post_tokens?: number };
    };
    if (event.type !== 'system' || event.subtype !== 'compact_boundary') return undefined;
    const meta = event.compact_metadata ?? {};
    return {
      trigger: meta.trigger ?? 'unknown',
      ...(meta.pre_tokens !== undefined ? { preTokens: meta.pre_tokens } : {}),
      ...(meta.post_tokens !== undefined ? { postTokens: meta.post_tokens } : {}),
    };
  } catch {
    return undefined;
  }
}

export class ClaudeAdapter implements EngineAdapter {
  readonly engine = 'claude' as const;
  private cachedChoices?: EngineChoices;

  constructor(private readonly bin = 'claude') {}

  choices(): EngineChoices {
    if (!this.cachedChoices) {
      try {
        const help = execFileSync(this.bin, ['--help'], { encoding: 'utf-8', timeout: 15_000 });
        this.cachedChoices = parseClaudeHelp(help);
      } catch (err) {
        console.error(`[Pixel Agents] Cats: could not read \`${this.bin} --help\`: ${err}`);
        return { models: [], efforts: [], fullModelPattern: FULL_MODEL_PATTERN };
      }
    }
    return this.cachedChoices;
  }

  mcpConfig(endpoint: OfficeMcpEndpoint): string {
    return JSON.stringify({
      mcpServers: {
        office: {
          type: 'http',
          url: endpoint.url,
          headers: { Authorization: `Bearer ${endpoint.token}` },
        },
      },
    });
  }

  interactiveResumeCommand(sessionId: string): { command: string; args: string[] } {
    return { command: this.bin, args: ['--resume', sessionId, '--dangerously-skip-permissions'] };
  }

  spawnTurn(req: TurnRequest): TurnHandle {
    const args = [
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      req.resume ? '--resume' : '--session-id',
      req.sessionId,
      '--append-system-prompt-file',
      req.systemPromptFile,
      '--model',
      req.model,
      ...(req.effort ? ['--effort', req.effort] : []),
      '--mcp-config',
      req.mcpConfigFile,
      '--strict-mcp-config',
      '--dangerously-skip-permissions',
    ];
    const child = spawn(this.bin, args, {
      cwd: req.cwd,
      env: claudeTurnEnv(req.cwd),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let result: StreamResult | undefined;
    let sessionStarted = false;
    let stderr = '';
    let pending = '';
    const onLine = (line: string): void => {
      if (line.includes('"session_id"')) sessionStarted = true;
      const compact = parseCompactBoundary(line);
      if (compact) req.onCompact?.(compact);
      const parsed = parseStreamLine(line);
      if (parsed.result) result = parsed.result;
      for (const entry of parsed.log) req.onLog?.(entry);
    };

    const done = new Promise<TurnOutcome>((resolve) => {
      child.stdout?.on('data', (chunk: Buffer) => {
        pending += chunk.toString();
        const lines = pending.split('\n');
        pending = lines.pop() ?? '';
        for (const line of lines) onLine(line);
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-STDERR_TAIL_CHARS);
      });
      child.on('error', (err) => {
        stderr += `\n${err.message}`;
      });
      child.on('close', (code) => {
        if (pending) onLine(pending);
        const ok = code === 0 && result !== undefined && !result.isError;
        resolve({
          ok,
          text: result?.text,
          sessionCostUsd: result?.costUsd,
          usage: result?.usage,
          sessionStarted,
          error: ok
            ? undefined
            : result?.isError
              ? (result.text ?? 'The turn reported an error')
              : `Exit code ${code ?? 'none'}: ${stderr.trim() || 'no output'}`,
        });
      });
    });

    // One user message, then EOF: the CLI answers it and exits.
    const message = { type: 'user', message: { role: 'user', content: req.message } };
    child.stdin?.on('error', () => {});
    child.stdin?.end(`${JSON.stringify(message)}\n`);

    return { done, kill: () => child.kill('SIGTERM') };
  }
}
