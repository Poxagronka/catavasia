/**
 * Narrator facade. Event sources push NarratorInput; the narrator broadcasts
 * Russian status lines (templates, at once) and conversation summaries
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
  NarratorSummary,
} from '../../../core/src/narrator.js';
import type { TaskLogEntry } from '../../../core/src/tasks.js';
import { HaikuBatcher, type HaikuBatcherOptions } from './haikuBatcher.js';
import { templateFor } from './templates.js';

/** Characters of a result / message body that go into a summary prompt. */
const PROMPT_TEXT_MAX_CHARS = 600;

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
  private readonly batcher: HaikuBatcher;

  constructor(private readonly opts: NarratorOptions) {
    this.batcher = new HaikuBatcher({
      ...opts.batcher,
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
      const prev = this.lines.get(input.catId);
      if (prev?.line !== t.line || prev.state !== t.state) {
        const line: NarratorLine = { catId: input.catId, ...t };
        this.lines.set(input.catId, line);
        this.opts.broadcast({ type: 'narratorLine', ...line });
      }
    }
    if (!this.opts.aiSummariesEnabled() || !input.text?.trim()) return;
    const text = clip(input.text.trim());
    if (input.kind === 'message') {
      const from = input.from ?? `кот ${input.catId}`;
      const to = input.to ?? 'коллега';
      const id = `chat:${[from, to].sort().join('|')}`;
      this.batcher.enqueue(id, [input.catId], [`${from} → ${to}: ${text}`]);
    } else if (input.kind === 'result') {
      this.batcher.enqueue(`result:${input.catId}`, [input.catId], [`Итог работы: ${text}`]);
    }
  }

  /**
   * Hook-derived states the stream-json does not carry. Only cats the narrator
   * already speaks for get them, so external sessions keep their raw status.
   */
  observeBroadcast(message: Record<string, unknown>): void {
    const id = message.id;
    if (typeof id !== 'number' || !this.lines.has(id)) return;
    if (message.type === 'agentToolPermission') {
      this.push({ catId: id, ts: Date.now(), kind: 'state', text: 'permission' });
    } else if (message.type === 'agentStatus' && message.awaitingInput === true) {
      this.push({ catId: id, ts: Date.now(), kind: 'state', text: 'input' });
    }
  }

  forget(catId: number): void {
    this.lines.delete(catId);
  }

  /** Current lines and summaries, for a client that just connected. */
  snapshot(): NarratorServerMessage[] {
    return [
      ...[...this.lines.values()].map((l) => ({ type: 'narratorLine' as const, ...l })),
      ...[...this.summaries.values()].map((s) => ({ type: 'narratorSummary' as const, ...s })),
    ];
  }

  dispose(): void {
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
      return { catId, ts, kind: 'state', text: 'thinking' };
  }
}
