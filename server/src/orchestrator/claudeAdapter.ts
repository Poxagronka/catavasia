/**
 * Claude Code engine adapter: one Claude Agent SDK `query()` per turn, which
 * drives the user's installed `claude` (never the SDK's own binary). The CEO
 * dock keeps one live `query()` per chat instead (claudeSession.ts).
 *
 * A turn is plain Claude Code plus our persona: its default system prompt,
 * the user, project and local settings (CLAUDE.md, hooks, skills, the user's
 * MCP servers and connectors), the office MCP server, and the permission mode
 * of the cat or the CEO. A mode that asks shows an approval card (askPermission).
 *
 * Claude Code reads AGENTS.md only when the folder has no CLAUDE.md (checked
 * with 2.1.292). When CLAUDE.md does not import it, the turn appends it.
 */

import type {
  CanUseTool,
  McpServerConfig,
  Options,
  PermissionResult,
  PermissionUpdate,
} from '@anthropic-ai/claude-agent-sdk' with { 'resolution-mode': 'import' };
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import type { EngineStatus, PermissionMode } from '../../../core/src/messages.js';
import { effectiveMode } from '../../../core/src/permissionModes.js';
import { parseStreamLine, type StreamResult } from '../taskBoard/streamJson.js';
import { officeLimits } from '../usageLimits.js';
import type { EngineChoices } from './catProfiles.js';
import {
  claudeOutcome,
  claudeUserMessage,
  errorText,
  openClaudeSession,
  SDK_MODES,
  STDERR_TAIL_CHARS,
} from './claudeSession.js';
import type {
  CompactInfo,
  LiveSession,
  OfficeMcpEndpoint,
  PermissionAnswer,
  SessionEngine,
  SessionRequest,
  TurnHandle,
  TurnRequest,
  TurnSetup,
} from './engineAdapter.js';
import { probeEngine } from './engineStatus.js';
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
 * The child env of a cat turn: plain Claude Code, so its own auto-compact
 * default applies (context-policy.md §4).
 */
export function claudeTurnEnv(cwd: string): NodeJS.ProcessEnv {
  return { ...process.env, PWD: cwd };
}

/** AGENTS.md of `cwd` for the appended system prompt, when Claude Code would skip it. */
function agentsMdText(cwd: string): string | undefined {
  const read = (name: string) => {
    try {
      return fs.readFileSync(path.join(cwd, name), 'utf-8');
    } catch {
      return undefined;
    }
  };
  const agents = read('AGENTS.md');
  const claude = read('CLAUDE.md');
  if (agents === undefined || claude === undefined || claude.includes('@AGENTS.md'))
    return undefined;
  return `Project instructions (AGENTS.md):\n\n${agents}`;
}

/** Read only also allows these (Claude Code's own read tools need no rule). */
const READ_ONLY_TOOLS = ['WebFetch', 'WebSearch'];

/**
 * The SDK's answer to one permission question. An approved plan switches the
 * mode with the allow itself (a `setMode` update, as the CLI's own plan
 * dialog does), so no edit runs in the old mode.
 */
export function permissionResult(
  answer: PermissionAnswer,
  input: Record<string, unknown>,
  suggestions: PermissionUpdate[] | undefined,
  canAlwaysAllow: boolean,
): PermissionResult {
  if (answer === 'deny') return { behavior: 'deny', message: 'The user did not allow this.' };
  if (typeof answer === 'object' && 'keepPlanning' in answer) {
    const words = answer.keepPlanning.trim();
    return {
      behavior: 'deny',
      message: `The user did not approve the plan. Keep planning${words ? `: ${words}` : '.'}`,
    };
  }
  if (typeof answer === 'object' && 'mode' in answer) {
    return {
      behavior: 'allow',
      updatedInput: input,
      updatedPermissions: [
        { type: 'setMode', mode: SDK_MODES[answer.mode], destination: 'session' },
      ],
    };
  }
  // AskUserQuestion takes the answers in its input (SDK AskUserQuestionInput.answers).
  if (typeof answer === 'object') {
    return { behavior: 'allow', updatedInput: { ...input, answers: answer.answers } };
  }
  return {
    behavior: 'allow',
    updatedInput: input,
    ...(answer === 'always' && canAlwaysAllow ? { updatedPermissions: suggestions } : {}),
  };
}

/**
 * The Agent SDK options of one turn: Claude Code's own system prompt with the
 * persona appended, the user, project and local settings (CLAUDE.md, hooks,
 * MCP servers, skills), the office MCP server, and the permission mode. A
 * mode that asks routes the question to `req.askPermission`; the office's
 * own tools never ask.
 */
export function claudeTurnOptions(req: TurnSetup, executable: string): Options {
  const mcpServers = (
    JSON.parse(fs.readFileSync(req.mcpConfigFile, 'utf-8')) as {
      mcpServers: Record<string, McpServerConfig>;
    }
  ).mcpServers;
  const ownTools = Object.keys(mcpServers).map((name) => `mcp__${name}`);
  const mode = effectiveMode('claude', req.model, req.permissionMode);
  const append = [fs.readFileSync(req.systemPromptFile, 'utf-8'), agentsMdText(req.cwd)]
    .filter(Boolean)
    .join('\n\n');
  const canUseTool: CanUseTool = async (toolName, input, opts) => {
    if (ownTools.some((own) => toolName.startsWith(`${own}__`))) {
      return { behavior: 'allow', updatedInput: input };
    }
    const canAlwaysAllow = !!opts.suggestions?.length && !opts.suppressAlwaysAllowRule;
    const answer = req.askPermission
      ? await req.askPermission({
          toolName,
          input,
          canAlwaysAllow,
          signal: opts.signal,
          folders: [req.cwd, ...(req.addDirs ?? [])],
        })
      : 'deny';
    return permissionResult(answer, input, opts.suggestions, canAlwaysAllow);
  };
  return {
    pathToClaudeCodeExecutable: executable,
    cwd: req.cwd,
    env: claudeTurnEnv(req.cwd),
    ...(req.resume ? { resume: req.sessionId } : { sessionId: req.sessionId }),
    model: req.model,
    ...(req.effort ? { effort: req.effort as Options['effort'] } : {}),
    systemPrompt: { type: 'preset', preset: 'claude_code', append },
    settingSources: ['user', 'project', 'local'],
    mcpServers,
    ...(req.addDirs?.length ? { additionalDirectories: req.addDirs } : {}),
    permissionMode: SDK_MODES[mode],
    ...(mode === 'bypass' ? { allowDangerouslySkipPermissions: true } : {}),
    ...(mode === 'readOnly' ? { allowedTools: [...READ_ONLY_TOOLS, ...ownTools] } : {}),
    // Every mode that may ask keeps it: a mode switch then needs no new process.
    ...(mode !== 'bypass' && mode !== 'readOnly' ? { canUseTool } : {}),
    ...(req.partialText ? { includePartialMessages: true } : {}),
  };
}

/** The installed `claude` the SDK drives: a bare name is looked up on PATH (PATHEXT on Windows). */
export function resolveExecutable(
  bin: string,
  env = process.env,
  platform = process.platform,
): string | undefined {
  if (bin.includes('/') || bin.includes('\\')) return bin;
  const exts = platform === 'win32' ? ['', ...(env.PATHEXT ?? '.EXE;.CMD').split(';')] : [''];
  for (const dir of (env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const file = path.join(dir, bin + ext);
      try {
        fs.accessSync(file, fs.constants.X_OK);
        if (fs.statSync(file).isFile()) return file;
      } catch {
        /* next candidate */
      }
    }
  }
  return undefined;
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

export class ClaudeAdapter implements SessionEngine {
  readonly engine = 'claude' as const;
  private cachedChoices?: EngineChoices;

  constructor(readonly bin = 'claude') {}

  choices(): EngineChoices {
    if (!this.cachedChoices) {
      try {
        const help = execFileSync(this.bin, ['--help'], { encoding: 'utf-8', timeout: 15_000 });
        this.cachedChoices = parseClaudeHelp(help);
      } catch (err) {
        const missing = (err as NodeJS.ErrnoException).code === 'ENOENT';
        if (!missing)
          console.error(`[catavasia] Cats: could not read \`${this.bin} --help\`: ${err}`);
        // Cached too: adapterFor() asks on every turn; a restart probes again.
        this.cachedChoices = {
          models: [],
          efforts: [],
          fullModelPattern: FULL_MODEL_PATTERN,
          ...(missing ? { unavailable: 'Claude Code CLI not found' } : {}),
        };
      }
    }
    return this.cachedChoices;
  }

  probeStatus(): Promise<EngineStatus> {
    return probeEngine('claude', this.bin);
  }

  mcpConfig(endpoint: OfficeMcpEndpoint): string {
    return JSON.stringify({
      mcpServers: {
        [endpoint.name ?? 'office']: {
          type: 'http',
          url: endpoint.url,
          headers: { Authorization: `Bearer ${endpoint.token}` },
        },
      },
    });
  }

  /**
   * The terminal in the cat's mode. `--permission-mode` takes the SDK names
   * (`claude --help` 2.1.292 lists `manual` and still takes `default`).
   */
  interactiveResumeCommand(
    sessionId: string,
    mode: PermissionMode,
  ): { command: string; args: string[] } {
    const modeArgs =
      mode === 'bypass'
        ? ['--dangerously-skip-permissions']
        : [
            '--permission-mode',
            SDK_MODES[mode],
            ...(mode === 'readOnly' ? ['--allowedTools', READ_ONLY_TOOLS.join(',')] : []),
          ];
    return { command: this.bin, args: ['--resume', sessionId, ...modeArgs] };
  }

  spawnTurn(req: TurnRequest): TurnHandle {
    const abort = new AbortController();
    let result: StreamResult | undefined;
    let sessionStarted = false;
    let stderr = '';
    const onMessage = (line: string): void => {
      if (line.includes('"session_id"')) sessionStarted = true;
      officeLimits.observe(line);
      req.onLine?.(line);
      const compact = parseCompactBoundary(line);
      if (compact) req.onCompact?.(compact);
      const parsed = parseStreamLine(line);
      if (parsed.result) result = parsed.result;
      for (const entry of parsed.log) req.onLog?.(entry);
    };
    const run = async (): Promise<string | undefined> => {
      const executable = resolveExecutable(this.bin);
      if (!executable) return 'Claude Code CLI not found';
      // The SDK is ESM: a CommonJS build loads it on first use.
      const { query } = await import('@anthropic-ai/claude-agent-sdk');
      // One user message; the SDK keeps the input open while a question waits.
      async function* prompt() {
        yield claudeUserMessage(req.message, req.images);
      }
      const turn = query({
        prompt: prompt(),
        options: {
          ...claudeTurnOptions(req, executable),
          abortController: abort,
          stderr: (data) => {
            stderr = (stderr + data).slice(-STDERR_TAIL_CHARS);
          },
        },
      });
      try {
        for await (const message of turn) onMessage(JSON.stringify(message));
      } catch (err) {
        return stderr.trim() ? `${errorText(err)}: ${stderr.trim()}` : errorText(err);
      }
      return undefined;
    };
    const done = run()
      .catch(errorText)
      .then((failed) => claudeOutcome(result, failed, sessionStarted));
    return { done, kill: () => abort.abort() };
  }

  /** The CEO dock's live session (claudeSession.ts). */
  openSession(req: SessionRequest): LiveSession {
    const executable = resolveExecutable(this.bin);
    return openClaudeSession(
      executable,
      (setup) => claudeTurnOptions(setup, executable ?? this.bin),
      req,
    );
  }
}
