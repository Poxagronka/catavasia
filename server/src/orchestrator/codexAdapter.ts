/**
 * Codex engine adapter: one `codex exec --json` process per turn.
 *
 * Flags verified with codex-cli 0.155.1 (docs/catavasia/ROADMAP.md, "Engine
 * per cat"). Codex picks the session id itself (`thread.started`), so the
 * outcome returns it and later turns run `codex exec resume <id>`.
 *
 * - `--ignore-user-config`: the user's config.toml (and its MCP servers) is
 *   not loaded; auth still comes from CODEX_HOME. Same idea as Claude's
 *   `--strict-mcp-config`: only the office MCP server is attached.
 * - `--dangerously-bypass-approvals-and-sandbox`: no approvals and no
 *   sandbox, as `--dangerously-skip-permissions` for Claude cats.
 * - The persona goes in as `developer_instructions` (appended to the built-in
 *   instructions; `model_instructions_file` would replace them).
 * - The office MCP server: `mcp_servers.office.url` with the token read from
 *   an env var (`bearer_token_env_var`), so it never shows in `ps`.
 */

import { execFileSync, spawn } from 'child_process';
import * as fs from 'fs';

import type { EngineChoices } from './catProfiles.js';
import { parseCodexLine } from './codexEvents.js';
import type {
  EngineAdapter,
  OfficeMcpEndpoint,
  TurnHandle,
  TurnOutcome,
  TurnRequest,
} from './engineAdapter.js';

const STDERR_TAIL_CHARS = 2000;
/** The child env var that carries the office MCP token. */
export const CODEX_OFFICE_TOKEN_ENV = 'CATAVASIA_OFFICE_TOKEN';

/**
 * `codex debug models` ("Render the raw model catalog as JSON") -> the
 * listed models (`visibility: "list"`) and every effort they support.
 */
export function parseCodexModels(json: string): EngineChoices {
  const catalog = JSON.parse(json) as {
    models?: Array<{
      slug?: string;
      visibility?: string;
      supported_reasoning_levels?: Array<{ effort?: string }>;
    }>;
  };
  const listed = (catalog.models ?? []).filter((m) => m.slug && m.visibility === 'list');
  const efforts: string[] = [];
  for (const m of listed) {
    for (const level of m.supported_reasoning_levels ?? []) {
      if (level.effort && !efforts.includes(level.effort)) efforts.push(level.effort);
    }
  }
  return { models: listed.map((m) => m.slug!), efforts };
}

/** A TOML basic string (`-c key=value` parses the value as TOML). */
export function tomlString(text: string): string {
  // JSON escapes are valid TOML escapes; TOML also bans a raw DEL.
  return JSON.stringify(text).replace(/\u007f/g, '\\u007F');
}

/** The `codex exec` arguments of one turn (stdin carries the message: `-`). */
export function codexTurnArgs(req: TurnRequest, persona: string, mcpUrl: string): string[] {
  return [
    'exec',
    ...(req.resume ? ['resume', req.sessionId] : []),
    '--json',
    '--ignore-user-config',
    '--skip-git-repo-check',
    '--dangerously-bypass-approvals-and-sandbox',
    '-m',
    req.model,
    ...(req.effort ? ['-c', `model_reasoning_effort=${tomlString(req.effort)}`] : []),
    '-c',
    `developer_instructions=${tomlString(persona)}`,
    '-c',
    `mcp_servers.office.url=${tomlString(mcpUrl)}`,
    '-c',
    `mcp_servers.office.bearer_token_env_var=${tomlString(CODEX_OFFICE_TOKEN_ENV)}`,
    '-c',
    'mcp_servers.office.required=true',
    '-',
  ];
}

export class CodexAdapter implements EngineAdapter {
  readonly engine = 'codex' as const;
  private cachedChoices?: EngineChoices;

  constructor(readonly bin = 'codex') {}

  choices(): EngineChoices {
    if (!this.cachedChoices) {
      try {
        const json = execFileSync(this.bin, ['debug', 'models'], {
          encoding: 'utf-8',
          timeout: 15_000,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        this.cachedChoices = parseCodexModels(json);
      } catch (err) {
        const missing = (err as NodeJS.ErrnoException).code === 'ENOENT';
        if (!missing) console.error(`[catavasia] Cats: \`${this.bin} debug models\`: ${err}`);
        // Cached too: adapterFor() asks on every turn; a restart probes again.
        this.cachedChoices = {
          models: [],
          efforts: [],
          ...(missing ? { unavailable: 'Codex CLI not found' } : {}),
        };
      }
    }
    return this.cachedChoices;
  }

  /** Read back by spawnTurn: Codex takes the server as `-c` overrides, not a file. */
  mcpConfig(endpoint: OfficeMcpEndpoint): string {
    return JSON.stringify(endpoint);
  }

  interactiveResumeCommand(sessionId: string): { command: string; args: string[] } {
    return {
      command: this.bin,
      // The TUI otherwise may open on an update prompt whose default (Enter)
      // runs `npm install -g @openai/codex`.
      args: [
        'resume',
        sessionId,
        '--dangerously-bypass-approvals-and-sandbox',
        '-c',
        'check_for_update_on_startup=false',
      ],
    };
  }

  spawnTurn(req: TurnRequest): TurnHandle {
    const endpoint = JSON.parse(fs.readFileSync(req.mcpConfigFile, 'utf-8')) as OfficeMcpEndpoint;
    const persona = fs.readFileSync(req.systemPromptFile, 'utf-8');
    const child = spawn(this.bin, codexTurnArgs(req, persona, endpoint.url), {
      cwd: req.cwd,
      env: { ...process.env, PWD: req.cwd, [CODEX_OFFICE_TOKEN_ENV]: endpoint.token },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const seen = new Set<string>();
    let threadId: string | undefined;
    let text: string | undefined;
    let error: string | undefined;
    let completed = false;
    let usage: TurnOutcome['usage'];
    let stderr = '';
    let pending = '';
    const onLine = (line: string): void => {
      const parsed = parseCodexLine(line, seen);
      threadId ??= parsed.threadId;
      text = parsed.text ?? text;
      error = parsed.error ?? error;
      usage = parsed.usage ?? usage;
      completed ||= parsed.turnCompleted === true;
      for (const entry of parsed.log) req.onLog?.(entry);
      for (const activity of parsed.activity) req.onActivity?.(activity);
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
        // A stream `error` may be a retry notice: `turn.completed` decides.
        const ok = code === 0 && completed;
        resolve({
          ok,
          text,
          usage,
          sessionStarted: threadId !== undefined,
          ...(threadId ? { sessionId: threadId } : {}),
          error: ok
            ? undefined
            : (error ?? `Exit code ${code ?? 'none'}: ${stderr.trim() || 'no output'}`),
        });
      });
    });

    child.stdin?.on('error', () => {});
    child.stdin?.end(req.message);

    return { done, kill: () => child.kill('SIGTERM') };
  }
}
