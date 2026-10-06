/**
 * Batched one-shot Haiku calls for conversation summaries.
 *
 * - Material queues per conversation. Every BATCH_INTERVAL_MS, when material is
 *   pending and no call is in flight, ONE `claude -p` call takes the whole queue.
 * - A failed call puts its items back and doubles the wait (up to BACKOFF_MAX_MS).
 * - A missing `claude` binary (spawn ENOENT) disables the batcher for good: the
 *   queue is dropped and enqueue becomes a no-op. Templates keep working.
 */

import { spawn } from 'child_process';

import {
  buildSummaryPrompt,
  parseSummaryOutput,
  SUMMARY_JSON_SCHEMA,
  SUMMARY_SYSTEM_PROMPT,
  type SummaryItem,
  type ValidSummary,
} from './schema.js';

export const BATCH_INTERVAL_MS = 10_000;
export const BACKOFF_MAX_MS = 5 * 60_000;
/** Conversations kept in the queue. The oldest are dropped first. */
export const QUEUE_MAX_CONVERSATIONS = 30;
/** Input lines kept per conversation. The oldest are dropped first. */
export const LINES_MAX_PER_CONVERSATION = 12;
const CALL_TIMEOUT_MS = 60_000;

/** Runs one call: user prompt in, `--output-format json` stdout out. */
export type SummaryRunner = (prompt: string) => Promise<string>;

/** Thrown by a runner when the CLI is not installed. */
export class ClaudeMissingError extends Error {}

export interface Clock {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realClock: Clock = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface HaikuBatcherOptions {
  onSummaries: (summaries: ValidSummary[]) => void;
  run?: SummaryRunner;
  clock?: Clock;
  intervalMs?: number;
  log?: (message: string) => void;
}

export class HaikuBatcher {
  private readonly queue = new Map<string, SummaryItem>();
  private readonly run: SummaryRunner;
  private readonly clock: Clock;
  private readonly intervalMs: number;
  private readonly log: (message: string) => void;
  private timer: unknown = null;
  private inFlight = false;
  private delayMs: number;
  private disabled = false;

  constructor(private readonly opts: HaikuBatcherOptions) {
    this.run = opts.run ?? runClaudeHaiku;
    this.clock = opts.clock ?? realClock;
    this.intervalMs = opts.intervalMs ?? BATCH_INTERVAL_MS;
    this.delayMs = this.intervalMs;
    this.log = opts.log ?? ((m) => console.log(`[Pixel Agents] Narrator: ${m}`));
  }

  get isDisabled(): boolean {
    return this.disabled;
  }

  get pendingCount(): number {
    return this.queue.size;
  }

  /** Add input lines to a conversation. Arms the timer when idle. */
  enqueue(conversationId: string, catIds: number[], lines: string[]): void {
    if (this.disabled || lines.length === 0) return;
    const item = this.queue.get(conversationId) ?? { conversationId, catIds: [], lines: [] };
    this.queue.delete(conversationId); // re-insert: most recent last
    for (const id of catIds) if (!item.catIds.includes(id)) item.catIds.push(id);
    item.lines.push(...lines);
    item.lines.splice(0, Math.max(0, item.lines.length - LINES_MAX_PER_CONVERSATION));
    this.queue.set(conversationId, item);
    while (this.queue.size > QUEUE_MAX_CONVERSATIONS) {
      this.queue.delete(this.queue.keys().next().value as string);
    }
    this.arm();
  }

  dispose(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.queue.clear();
    this.disabled = true;
  }

  private arm(): void {
    if (this.timer !== null || this.inFlight || this.disabled || this.queue.size === 0) return;
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.delayMs);
  }

  private async flush(): Promise<void> {
    if (this.inFlight || this.disabled || this.queue.size === 0) return;
    const batch = [...this.queue.values()];
    this.queue.clear();
    this.inFlight = true;
    try {
      const stdout = await this.run(buildSummaryPrompt(batch));
      const summaries = parseSummaryOutput(stdout, batch);
      this.delayMs = this.intervalMs;
      if (summaries.length > 0 && !this.disabled) this.opts.onSummaries(summaries);
    } catch (err) {
      if (err instanceof ClaudeMissingError) {
        this.log('claude CLI not found, AI summaries are off until restart');
        this.dispose();
        return;
      }
      this.delayMs = Math.min(this.delayMs * 2, BACKOFF_MAX_MS);
      this.log(`summary call failed, retry in ${this.delayMs / 1000} s: ${errorText(err)}`);
      this.requeue(batch);
    } finally {
      this.inFlight = false;
    }
    this.arm();
  }

  /** Put a failed batch back in front of anything that arrived meanwhile. */
  private requeue(batch: SummaryItem[]): void {
    const newer = [...this.queue.values()];
    this.queue.clear();
    for (const item of batch) this.queue.set(item.conversationId, item);
    for (const item of newer) this.enqueue(item.conversationId, item.catIds, item.lines);
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Lean flags verified in research (scratchpad/research/jev.md): ~5 s, ~1.3k tokens. */
export function haikuArgs(): string[] {
  return [
    '-p',
    '--model',
    'haiku',
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(SUMMARY_JSON_SCHEMA),
    '--tools',
    '',
    '--system-prompt',
    SUMMARY_SYSTEM_PROMPT,
    '--setting-sources',
    '',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--no-session-persistence',
  ];
}

/** Default runner: one `claude -p` process, prompt via stdin. */
export function runClaudeHaiku(prompt: string, bin = 'claude'): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, haikuArgs(), {
      env: { ...process.env, MAX_THINKING_TOKENS: '0' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), CALL_TIMEOUT_MS);
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString()));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString()));
    child.stdin.on('error', () => {});
    child.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(err.code === 'ENOENT' ? new ClaudeMissingError(err.message) : err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`exit ${code ?? 'signal'}: ${(stderr || stdout).trim().slice(-300)}`));
    });
    child.stdin.end(prompt);
  });
}
