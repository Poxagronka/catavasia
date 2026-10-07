/**
 * Claude Code's own slash commands and MCP servers ("connectors") for the CEO
 * dock. Reads go through a short Agent SDK session that never sends a message,
 * so no model turn runs: initialize answers the commands (and the output
 * styles, the choices of /output-style), mcpServerStatus() the servers. Checked on CLI 2.1.292 with a temp CLAUDE_CONFIG_DIR:
 *
 * - toggleMcpServer() persists in `projects[<folder>].disabledMcpServers` of
 *   the Claude config; a git worktree of the folder shares it, so the cats'
 *   task worktrees see the same on / off.
 * - The SDK cannot add, remove or sign in: that is the `claude mcp` CLI.
 *   `claude mcp login` refuses without a terminal, so it runs in a PTY.
 */

import type {
  McpServerStatus,
  Options,
  Query,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk' with { 'resolution-mode': 'import' };
import { execFile } from 'child_process';

import type { CeoConnectorAddRequest, Connector, DeskCommand } from '../../../core/src/ceoDesk.js';
import { ptyModule } from '../catTerminal/ptyModule.js';
import { resolveExecutable } from '../orchestrator/claudeAdapter.js';

export type QueryFn = (args: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => Query;

/** A control session that hangs (a stuck MCP server) ends here. */
const CONTROL_TIMEOUT_MS = 30_000;
/** How long the list waits for servers that are still connecting. */
const SETTLE_MS = 8_000;
const SETTLE_POLL_MS = 300;
/** The command list is read again after this (new skills, plugins). */
const COMMANDS_TTL_MS = 5 * 60_000;
const CLI_TIMEOUT_MS = 30_000;
/** The user signs in in the browser; the CLI waits for the callback. */
const LOGIN_TIMEOUT_MS = 4 * 60_000;

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** `node server.js --port 1`, `"my tool" -x` -> argv (double or single quotes group words). */
export function splitCommand(line: string): string[] {
  return [...line.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
}

/** The `claude mcp add` arguments of the dock's Add form. */
export function addArgs(req: CeoConnectorAddRequest): string[] {
  const target = req.target.trim();
  const head = ['mcp', 'add', '--scope', req.scope];
  return /^https?:\/\//i.test(target)
    ? [...head, '--transport', 'http', req.name, target]
    : [...head, req.name, '--', ...splitCommand(target)];
}

/**
 * The fixed values of an argument hint: "[red|blue]" or "<on|off>" -> the
 * words; a free hint ("<model>", "key=value") has none.
 */
function hintChoices(hint: string): string[] | undefined {
  const words = /^[[<]([\w-]+(?:\|[\w-]+)+)[\]>]$/.exec(hint.trim());
  return words?.[1].split('|');
}

/** The SDK's status rows as the dock shows them. */
export function toConnectors(statuses: McpServerStatus[]): Connector[] {
  return statuses.map((s) => {
    const config = (s.config ?? {}) as {
      type?: string;
      url?: string;
      command?: string;
      args?: string[];
    };
    const target = config.url ?? [config.command, ...(config.args ?? [])].filter(Boolean).join(' ');
    return {
      name: s.name,
      status: s.status,
      source: s.source ?? s.scope ?? 'user',
      ...(target ? { target } : {}),
      ...(s.error ? { error: s.error } : {}),
      web: !!config.url || config.type === 'claudeai-proxy',
    };
  });
}

/** A text with terminal colour codes and carriage returns removed. */
function plain(text: string): string {
  return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r/g, '');
}

export class ClaudeControl {
  private readonly commandCache = new Map<string, { at: number; list: Promise<DeskCommand[]> }>();

  constructor(
    private readonly bin = 'claude',
    private readonly queryFn?: QueryFn,
    private readonly now = Date.now,
  ) {}

  /** The commands of `cwd`, cached per folder. */
  commands(cwd: string): Promise<DeskCommand[]> {
    const hit = this.commandCache.get(cwd);
    if (hit && this.now() - hit.at < COMMANDS_TTL_MS) return hit.list;
    const list = this.session(cwd, (q) => q.initializationResult()).then((init) =>
      // `__name`: Claude Code's internal commands. "(removed) ...": a dead
      // command the CLI still lists (2.1.292: /agents).
      init.commands
        .filter((c) => !c.name.startsWith('_') && !c.description.startsWith('(removed)'))
        .map((c) => {
          const choices =
            c.name === 'output-style'
              ? init.available_output_styles
              : hintChoices(c.argumentHint ?? '');
          return {
            name: c.name,
            description: c.description,
            argumentHint: c.argumentHint ?? '',
            ...(c.aliases?.length ? { aliases: c.aliases } : {}),
            ...(c.builtin ? { builtin: true } : {}),
            ...(choices?.length ? { choices } : {}),
          };
        }),
    );
    this.commandCache.set(cwd, { at: this.now(), list });
    list.catch(() => this.commandCache.delete(cwd));
    return list;
  }

  /** Every server Claude Code would load in `cwd`, after a short wait for the slow ones. */
  connectors(cwd: string): Promise<Connector[]> {
    return this.session(cwd, (q) => this.settled(q));
  }

  /** Turn a server off or on for the folder (and its task worktrees). */
  toggle(cwd: string, name: string, enabled: boolean): Promise<Connector[]> {
    return this.session(cwd, async (q) => {
      await q.toggleMcpServer(name, enabled);
      return this.settled(q);
    });
  }

  add(cwd: string, req: CeoConnectorAddRequest): Promise<void> {
    return this.cli(cwd, addArgs(req));
  }

  remove(cwd: string, name: string, source: string): Promise<void> {
    const scoped = ['user', 'local', 'project'].includes(source) ? ['--scope', source] : [];
    return this.cli(cwd, ['mcp', 'remove', name, ...scoped]);
  }

  /** `claude mcp login <name>` in a PTY: it opens the browser and waits for the sign-in. */
  login(cwd: string, name: string): Promise<void> {
    const executable = this.executable();
    const { module: pty } = ptyModule();
    if (!pty) {
      return Promise.reject(
        new Error(`Sign-in needs a terminal here. Run \`claude mcp login ${name}\` in one.`),
      );
    }
    const env = Object.fromEntries(
      Object.entries({ ...process.env, PWD: cwd }).filter((e): e is [string, string] => !!e[1]),
    );
    return new Promise((resolve, reject) => {
      const term = pty.spawn(executable, ['mcp', 'login', name], {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd,
        env,
      });
      let output = '';
      const timer = setTimeout(() => term.kill(), LOGIN_TIMEOUT_MS);
      term.onData((data) => {
        output = (output + data).slice(-4000);
      });
      term.onExit(({ exitCode }) => {
        clearTimeout(timer);
        if (exitCode === 0) return resolve();
        const said = plain(output).trim().split('\n').at(-1)?.trim();
        reject(new Error(said || 'The sign-in did not finish'));
      });
    });
  }

  private executable(): string {
    const found = resolveExecutable(this.bin);
    if (!found) throw new Error('Claude Code CLI not found');
    return found;
  }

  private cli(cwd: string, args: string[]): Promise<void> {
    const executable = this.executable();
    this.commandCache.clear(); // a server's prompts are commands too
    return new Promise((resolve, reject) => {
      execFile(executable, args, { cwd, timeout: CLI_TIMEOUT_MS }, (err, _stdout, stderr) => {
        if (!err) return resolve();
        reject(new Error(plain(String(stderr)).trim() || errorText(err)));
      });
    });
  }

  /** Statuses once no server is still connecting, or after SETTLE_MS. */
  private async settled(q: Query): Promise<Connector[]> {
    const deadline = this.now() + SETTLE_MS;
    let statuses = await q.mcpServerStatus();
    while (statuses.some((s) => s.status === 'pending') && this.now() < deadline) {
      await sleep(SETTLE_POLL_MS);
      statuses = await q.mcpServerStatus();
    }
    return toConnectors(statuses);
  }

  /** A Claude Code process with no message (no model turn), closed after `use`. */
  private async session<T>(cwd: string, use: (q: Query) => Promise<T>): Promise<T> {
    const executable = this.executable();
    const query = this.queryFn ?? (await import('@anthropic-ai/claude-agent-sdk')).query;
    let release = () => {};
    const done = new Promise<void>((resolve) => (release = resolve));
    const prompt: AsyncIterable<SDKUserMessage> = {
      [Symbol.asyncIterator]: () => ({
        next: () => done.then(() => ({ done: true as const, value: undefined })),
      }),
    };
    const q = query({
      prompt,
      options: {
        pathToClaudeCodeExecutable: executable,
        cwd,
        settingSources: ['user', 'project', 'local'],
        env: { ...process.env, PWD: cwd },
      },
    });
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('Claude Code did not answer in time')),
        CONTROL_TIMEOUT_MS,
      );
    });
    try {
      return await Promise.race([use(q), timeout]);
    } finally {
      clearTimeout(timer);
      release();
      q.close();
    }
  }
}
