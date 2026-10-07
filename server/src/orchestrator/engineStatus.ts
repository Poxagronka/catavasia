/**
 * Engine status: is the engine CLI installed, which version, is it logged in.
 *
 * Probe commands (verified from the installed CLIs' --help, 2026-10-06):
 *   claude --version        "2.1.291 (Claude Code)"
 *   claude auth status      JSON {"loggedIn": bool, "authMethod": ...}; exit 1 when logged out
 *     authMethod (2.1.292): "claude.ai" | "oauth_token" (subscription), "api_key" |
 *     "api_key_helper" | "third_party" (Bedrock/Vertex/Foundry: pay per use), "none"
 *   codex --version         "codex-cli 0.160.1"
 *   codex login status      "Logged in using ChatGPT" / "Logged in using an API key - ***" /
 *                           "Not logged in" (on stderr); exit 1 when logged out
 *
 * A result is cached for STATUS_TTL_MS. Reading a stale status starts a probe
 * in the background; `refresh(true)` probes now ("Check again").
 */

import { spawn } from 'child_process';

import { ENGINE_INSTALL_COMMANDS, ENGINE_LOGIN_COMMANDS } from '../../../core/src/constants.js';
import type { CatEngine, EngineStatus } from '../../../core/src/messages.js';

export const STATUS_TTL_MS = 30_000;
const PROBE_TIMEOUT_MS = 15_000;

const ENGINE_LABELS: Record<CatEngine, string> = { claude: 'Claude Code', codex: 'Codex' };

type AuthFields = Pick<EngineStatus, 'loggedIn' | 'detail' | 'apiKey'>;

/** Claude auth methods billed per use: the UI shows money only for these. */
const CLAUDE_PAID_METHODS = new Set(['api_key', 'api_key_helper', 'third_party']);
/** Claude auth methods of a subscription login. Any other method leaves `apiKey` unknown. */
const CLAUDE_PLAN_METHODS = new Set(['claude.ai', 'oauth_token']);

/** `claude auth status` (JSON) -> loggedIn, a short detail, API key or not. Unknown output -> {}. */
export function parseClaudeAuthStatus(output: string): AuthFields {
  try {
    const json = JSON.parse(output) as { loggedIn?: unknown; authMethod?: unknown };
    if (typeof json.loggedIn !== 'boolean') return {};
    const method = typeof json.authMethod === 'string' ? json.authMethod : undefined;
    if (!json.loggedIn) return { loggedIn: false, detail: 'not logged in' };
    const apiKey = !method
      ? undefined
      : CLAUDE_PAID_METHODS.has(method)
        ? true
        : CLAUDE_PLAN_METHODS.has(method)
          ? false
          : undefined;
    return {
      loggedIn: true,
      ...(method ? { detail: `logged in (${method})` } : {}),
      ...(apiKey !== undefined ? { apiKey } : {}),
    };
  } catch {
    return {};
  }
}

/** `codex login status` text -> loggedIn, a short detail, API key or not. Unknown output -> {}. */
export function parseCodexLoginStatus(output: string): AuthFields {
  if (/^\s*Not logged in/im.test(output)) return { loggedIn: false, detail: 'not logged in' };
  const line = /^\s*(Logged in[^\n]*)/im.exec(output)?.[1];
  // "Logged in using an API key - sk-..." must not show the key.
  if (!line) return {};
  const detail = line.split(' - ')[0].trim();
  const apiKey = /api key/i.test(detail) ? true : /chatgpt/i.test(detail) ? false : undefined;
  return { loggedIn: true, detail, ...(apiKey !== undefined ? { apiKey } : {}) };
}

/** First version-like token: "2.1.291 (Claude Code)" -> 2.1.291, "codex-cli 0.160.1" -> 0.160.1. */
export function parseVersion(output: string): string | undefined {
  return /\d+\.\d+\.\d+[\w.-]*/.exec(output)?.[0];
}

/**
 * An engine error that means "log in first". Claude headless: result text
 * "Not logged in · Please run /login" (error "authentication_failed").
 */
export function isAuthError(text: string | undefined): boolean {
  // Anchored: a task's own text ("Stripe: Invalid API key") must not count as an engine logout.
  return (
    !!text &&
    (/please run \/login/i.test(text) ||
      /^\s*(not logged in\b|invalid api key|oauth token has expired|authentication_failed)/i.test(
        text,
      ))
  );
}

/** Why the engine cannot run now; undefined when ready (or still unknown). */
export function notReadyReason(engine: CatEngine, status?: EngineStatus): string | undefined {
  if (!status) return undefined;
  const label = ENGINE_LABELS[engine];
  if (!status.installed) return `${label}: not installed`;
  if (status.loggedIn === false) return `${label}: not logged in`;
  return undefined;
}

/** What is wrong and how to fix it, for a task that cannot start or stopped. */
export function actionableMessage(engine: CatEngine, status?: EngineStatus): string {
  const label = ENGINE_LABELS[engine];
  if (status && !status.installed)
    return `${label} is not installed. Install it with \`${ENGINE_INSTALL_COMMANDS[engine]}\`, then press Check again in the engine notice.`;
  const login = ENGINE_LOGIN_COMMANDS[engine].join(' ');
  return `${label} is not logged in. Press Log in in the engine notice (or run \`${login}\` in a terminal), then Check again.`;
}

interface RunResult {
  missing: boolean;
  code: number | null;
  output: string;
}

/** Run a CLI with stdin closed; stdout + stderr together (codex writes its status to stderr). */
function runProbe(bin: string, args: string[]): Promise<RunResult> {
  return new Promise((resolve) => {
    let output = '';
    let missing = false;
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => child.kill('SIGKILL'), PROBE_TIMEOUT_MS);
    child.stdout?.on('data', (d: Buffer) => (output += d.toString()));
    child.stderr?.on('data', (d: Buffer) => (output += d.toString()));
    child.on('error', (err: NodeJS.ErrnoException) => {
      missing = err.code === 'ENOENT';
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ missing, code, output });
    });
  });
}

/** Probe one engine CLI: version, then its login status. */
export async function probeEngine(engine: CatEngine, bin: string): Promise<EngineStatus> {
  const version = await runProbe(bin, ['--version']);
  if (version.missing) return { installed: false, detail: `${bin} not found on PATH` };
  const parsedVersion = parseVersion(version.output);
  const auth =
    engine === 'claude'
      ? parseClaudeAuthStatus((await runProbe(bin, ['auth', 'status'])).output)
      : parseCodexLoginStatus((await runProbe(bin, ['login', 'status'])).output);
  return { installed: true, ...(parsedVersion ? { version: parsedVersion } : {}), ...auth };
}

/** Cached status of one engine. */
export class EngineStatusProbe {
  private status?: EngineStatus;
  private at = 0;
  private inFlight?: Promise<EngineStatus>;

  constructor(
    private readonly probe: () => Promise<EngineStatus>,
    private readonly onChange: () => void,
    private readonly now: () => number = Date.now,
  ) {}

  /** The cached status (undefined before the first probe). A stale one starts a probe. */
  current(): EngineStatus | undefined {
    if (this.now() - this.at > STATUS_TTL_MS) void this.refresh();
    return this.status;
  }

  /** Probe when stale (or `force`); one probe at a time. */
  refresh(force = false): Promise<EngineStatus> {
    // A forced probe must start after the reason for it (a login that just ended).
    if (this.inFlight) return force ? this.inFlight.then(() => this.refresh(true)) : this.inFlight;
    if (!force && this.status && this.now() - this.at <= STATUS_TTL_MS)
      return Promise.resolve(this.status);
    this.inFlight = this.probe()
      .then((status) => {
        this.set(status);
        return status;
      })
      .finally(() => (this.inFlight = undefined));
    return this.inFlight;
  }

  /** A turn failed with an auth error: logged out until the next probe says otherwise. */
  markLoggedOut(): void {
    this.set({ ...(this.status ?? { installed: true }), loggedIn: false, detail: 'not logged in' });
  }

  private set(status: EngineStatus): void {
    const changed = JSON.stringify(status) !== JSON.stringify(this.status);
    this.status = status;
    this.at = this.now();
    if (changed) this.onChange();
  }
}
