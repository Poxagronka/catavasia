/**
 * Narrator facade. Event sources push NarratorInput; the narrator broadcasts
 * English phase lines (templates, held PHASE_MIN_MS) and conversation summaries
 * (HaikuBatcher, every 10 s when material is pending).
 *
 * Sources today: the task board stream-json (taskLogInput) and the hook-derived
 * permission / waiting broadcasts (observeBroadcast). Orchestration phase 1
 * pushes its own events through the same NarratorInput.
 */

import type {
  NarratorInput,
  NarratorLine,
  NarratorServerMessage,
  NarratorState,
  NarratorSummary,
} from '../../../core/src/narrator.js';
import type { TaskLogEntry } from '../../../core/src/tasks.js';
import { HaikuBatcher, type HaikuBatcherOptions } from './haikuBatcher.js';
import { templateFor } from './templates.js';

/** Characters of a result / message body that go into a summary prompt. */
const PROMPT_TEXT_MAX_CHARS = 600;

/** Minimum time a work phase stays on the label. */
export const PHASE_MIN_MS = 3000;
/** States that replace the label at once and are never held back. */
const URGENT = new Set<NarratorState>(['waiting', 'done', 'error']);

export interface NarratorOptions {
  broadcast: (message: NarratorServerMessage) => void;
  /** Read on every summary-worthy event, so a settings toggle applies at once. */
  aiSummariesEnabled: () => boolean;
  /** Batcher overrides (tests). */
  batcher?: Omit<HaikuBatcherOptions, 'onSummaries'>;
}

export class Narrator {
  private readonly lines = new Map<number, NarratorLine>();
  private readonly summaries = new Map<string, NarratorSummary>();
  /** The line a hook-derived wait replaced, restored when the wait clears. */
  private readonly beforeWait = new Map<number, NarratorLine>();
  /** When the current line of a cat was broadcast (epoch ms). */
  private readonly shownAt = new Map<number, number>();
  /** A work phase that waits for the current one to reach PHASE_MIN_MS. */
  private readonly pending = new Map<
    number,
    { timer: ReturnType<typeof setTimeout>; line: NarratorLine }
  >();
  private readonly batcher: HaikuBatcher;

  constructor(private readonly opts: NarratorOptions) {
    this.batcher = new HaikuBatcher({
      ...opts.batcher,
      // Turning the setting off drops queued material before the next call.
      shouldRun: () => opts.aiSummariesEnabled(),
      onSummaries: (list) => {
        for (const s of list) {
          this.summaries.set(s.conversationId, s);
          this.opts.broadcast({ type: 'narratorSummary', ...s });
        }
      },
    });
  }

  push(input: NarratorInput): void {
    const t = templateFor(input);
    if (t) {
      this.beforeWait.delete(input.catId);
      this.show({ catId: input.catId, ...t });
    }
    if (!this.opts.aiSummariesEnabled() || !input.text?.trim()) return;
    const text = clip(input.text.trim());
    if (input.kind === 'message') {
      const from = input.from ?? `cat ${input.catId}`;
      const to = input.to ?? 'teammate';
      const id = `chat:${[from, to].sort().join('|')}`;
      this.batcher.enqueue(id, [input.catId], [`${from} → ${to}: ${text}`]);
    } else if (input.kind === 'result') {
      this.batcher.enqueue(`result:${input.catId}`, [input.catId], [`Result: ${text}`]);
    }
  }

  /**
   * Hook-derived states the stream-json does not carry. Only cats the narrator
   * already speaks for get them, so external sessions keep their raw status.
   */
  observeBroadcast(message: Record<string, unknown>): void {
    const id = message.id;
    if (typeof id !== 'number' || !this.lines.has(id)) return;
    const waiting =
      message.type === 'agentToolPermission'
        ? 'permission'
        : message.type === 'agentStatus' && message.awaitingInput === true
          ? 'input'
          : undefined;
    if (waiting) {
      const prev = this.beforeWait.get(id) ?? this.pending.get(id)?.line ?? this.lines.get(id);
      this.push({ catId: id, ts: Date.now(), kind: 'state', text: waiting });
      if (prev) this.beforeWait.set(id, prev);
      return;
    }
    // A cleared permission or a resumed turn restores the line the wait replaced.
    const cleared =
      message.type === 'agentToolPermissionClear' ||
      (message.type === 'agentStatus' && message.status === 'active');
    const prev = this.beforeWait.get(id);
    if (cleared && prev) {
      this.beforeWait.delete(id);
      this.show(prev);
    }
  }

  /**
   * Broadcast a phase change. A work phase holds for PHASE_MIN_MS, so the label
   * does not flicker on every tool call: a newer work phase waits for the rest
   * of that time (the latest one wins). Waits, done and errors show at once.
   */
  private show(line: NarratorLine): void {
    const { catId } = line;
    clearTimeout(this.pending.get(catId)?.timer);
    this.pending.delete(catId);
    const prev = this.lines.get(catId);
    if (prev?.line === line.line && prev.state === line.state) return;
    const hold =
      prev && !URGENT.has(prev.state) && !URGENT.has(line.state)
        ? (this.shownAt.get(catId) ?? 0) + PHASE_MIN_MS - Date.now()
        : 0;
    if (hold > 0) {
      this.pending.set(catId, { timer: setTimeout(() => this.show(line), hold), line });
      return;
    }
    this.lines.set(catId, line);
    this.shownAt.set(catId, Date.now());
    this.opts.broadcast({ type: 'narratorLine', ...line });
  }

  forget(catId: number): void {
    clearTimeout(this.pending.get(catId)?.timer);
    this.pending.delete(catId);
    this.shownAt.delete(catId);
    this.lines.delete(catId);
    this.beforeWait.delete(catId);
    for (const [key, s] of this.summaries) if (s.catIds.includes(catId)) this.summaries.delete(key);
  }

  /** Current lines and summaries, for a client that just connected. */
  snapshot(): NarratorServerMessage[] {
    return [
      ...[...this.lines.values()].map((l) => ({ type: 'narratorLine' as const, ...l })),
      ...[...this.summaries.values()].map((s) => ({ type: 'narratorSummary' as const, ...s })),
    ];
  }

  dispose(): void {
    for (const p of this.pending.values()) clearTimeout(p.timer);
    this.pending.clear();
    this.batcher.dispose();
  }
}

function clip(text: string): string {
  return text.length > PROMPT_TEXT_MAX_CHARS ? `${text.slice(0, PROMPT_TEXT_MAX_CHARS)}…` : text;
}

const FILE_TOOLS = new Set(['Read', 'Edit', 'MultiEdit', 'Write', 'NotebookEdit', 'NotebookRead']);

/** Map one task board log entry (streamJson.ts) to a narrator event. */
export function taskLogInput(catId: number, entry: TaskLogEntry, ts: number): NarratorInput {
  switch (entry.kind) {
    case 'tool':
      return {
        catId,
        ts,
        kind: 'tool',
        tool: entry.name,
        file: FILE_TOOLS.has(entry.name ?? '') ? entry.text : undefined,
        text: entry.text,
      };
    case 'error':
      return { catId, ts, kind: 'state', text: 'error' };
    case 'text':
    case 'user': // A console message starts a new turn.
      return { catId, ts, kind: 'state', text: 'thinking' };
    case 'message':
      return { catId, ts, kind: 'message', text: entry.text };
  }
}
