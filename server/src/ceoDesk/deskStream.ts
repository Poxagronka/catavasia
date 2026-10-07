/**
 * The rows of one CEO turn, read from the raw stream lines (Agent SDK
 * messages as stream-json): replies, tool calls with their full input and
 * result, images that tools return, "Thought for 3s" rows, and how full the
 * context window is. Shapes checked on CLI 2.1.292 (docs: the parity design).
 *
 * Only the CEO's own thread counts: a helper's messages (`parent_tool_use_id`)
 * are its business. Desk tools write their own readable row (callTool).
 */

import type { CatSessionEntry, ContextUse } from '../../../core/src/catSession.js';
import type { CeoAttachment } from '../../../core/src/ceoDesk.js';
import { DEFAULT_MAX_CONTEXT_TOKENS } from '../constants.js';
import { relativePaths, summarizeInput } from '../taskBoard/streamJson.js';
import type { DeskRow } from './deskStore.js';
import { DESK_MCP_NAME } from './deskTools.js';

const DESK_TOOL_PREFIX = `mcp__${DESK_MCP_NAME}__`;
/** Caps of what a tool row keeps (the history file and the socket frame stay small). */
export const TOOL_INPUT_MAX_CHARS = 4000;
export const TOOL_RESULT_MAX_CHARS = 4000;
/** The live reply goes to the dock at most this often (each frame re-renders its Markdown). */
export const DRAFT_EVERY_MS = 50;

export interface ToolImage {
  mediaType: string;
  /** Base64 bytes. */
  data: string;
}

export interface DeskStreamHost {
  /** Append a row; returns it with its `at`. */
  add(entry: CatSessionEntry): DeskRow;
  /** Replace the row with the same `at`. */
  update(row: DeskRow): void;
  /** Save images a tool returned (attachments.ts); none when they break a limit. */
  saveImages(images: ToolImage[]): CeoAttachment[];
  /** The context window use changed. */
  context(use: ContextUse): void;
  /** The reply so far, as Claude writes it (partial messages). */
  draft(text: string): void;
  /** Folders whose paths show relative (the project folder first). */
  folders: string[];
}

type Block = Record<string, unknown>;
type ToolRow = Extract<CatSessionEntry, { kind: 'tool' }> & { at: number };

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** What a tool was given, for its open row: the command or file alone, else the input as JSON. */
function inputText(input: unknown): string {
  const rec = (input ?? {}) as Record<string, unknown>;
  const keys = Object.keys(rec);
  if (keys.length === 1 && typeof rec[keys[0]] === 'string') return rec[keys[0]] as string;
  return JSON.stringify(input, null, 2);
}

export class DeskStream {
  /** The newest reply text: the turn's full final text replaces it at the end. */
  held: string | undefined;
  private readonly tools = new Map<string, ToolRow>();
  private model: string | undefined;
  /** The text block Claude is writing now (its deltas so far) and when it last went out. */
  private draft = '';
  private draftAt = 0;
  private window: number;
  private used = 0;

  constructor(
    private readonly host: DeskStreamHost,
    last?: ContextUse,
  ) {
    this.window = last?.window ?? DEFAULT_MAX_CONTEXT_TOKENS;
  }

  line(line: string): void {
    let rec: Record<string, unknown>;
    try {
      rec = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    if (rec.type === 'system' && rec.subtype === 'init' && typeof rec.model === 'string') {
      this.model = rec.model;
      return;
    }
    if (rec.type === 'result') return this.result(rec);
    if (rec.type === 'system' && rec.subtype === 'compact_boundary') return this.compacted(rec);
    if (rec.parent_tool_use_id) return;
    if (rec.type === 'stream_event') return this.partial(rec.event as Block | undefined);
    const message = rec.message as { content?: unknown; usage?: Record<string, unknown> };
    if (!Array.isArray(message?.content)) return;
    for (const block of message.content as Block[]) {
      if (rec.type === 'assistant') this.assistantBlock(block, rec);
      else if (rec.type === 'user' && block.type === 'tool_result') this.toolResult(block);
    }
    if (rec.type === 'assistant' && message.usage) this.usage(message.usage);
  }

  /** /compact (or the auto-compact) summarised the chat: a quiet row; the context shrank. */
  private compacted(rec: Record<string, unknown>): void {
    this.flush();
    this.host.add({ kind: 'note', text: 'Summarised the chat' });
    const after = (rec.compact_metadata as { post_tokens?: unknown } | undefined)?.post_tokens;
    if (typeof after !== 'number') return;
    this.used = after;
    this.host.context({ used: after, window: this.window });
  }

  /**
   * A partial message: a new text block puts the text before it in its row;
   * each text delta grows the draft the dock shows.
   */
  private partial(event: Block | undefined): void {
    const block = event?.content_block as Block | undefined;
    if (event?.type === 'content_block_start' && block?.type === 'text') {
      this.flush();
      this.draft = '';
      return;
    }
    const delta = event?.delta as Block | undefined;
    if (event?.type !== 'content_block_delta' || delta?.type !== 'text_delta') return;
    this.draft += typeof delta.text === 'string' ? delta.text : '';
    const now = Date.now();
    if (now - this.draftAt < DRAFT_EVERY_MS || !this.draft.trim()) return;
    this.draftAt = now;
    this.host.draft(this.draft.trim());
  }

  /** The text before an action explains it: it goes before the action's row. */
  private flush(): void {
    if (this.held !== undefined) this.host.add({ kind: 'text', text: this.held });
    this.held = undefined;
  }

  private rel(text: string): string {
    return relativePaths(text, this.host.folders);
  }

  private assistantBlock(block: Block, rec: Record<string, unknown>): void {
    if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
      this.flush();
      this.held = block.text.trim();
      // The finished block: the deltas the throttle held back show too.
      if (this.draft) this.host.draft(this.held);
      this.draft = '';
    } else if (block.type === 'thinking' && typeof rec.thinking_duration_ms === 'number') {
      this.flush();
      this.host.add({ kind: 'thought', ms: rec.thinking_duration_ms });
    } else if (block.type === 'tool_use' && typeof block.name === 'string') {
      this.flush();
      if (block.name.startsWith(DESK_TOOL_PREFIX)) return;
      // A command or helper says what it is for: that is its line, the rest its detail.
      const { description, ...rest } = (block.input ?? {}) as Record<string, unknown>;
      const about = typeof description === 'string' ? description.trim() : '';
      const shown = about ? rest : block.input;
      const input = this.rel(inputText(shown));
      const text = this.rel(summarizeInput(shown));
      const row = this.host.add({
        kind: 'tool',
        name: block.name,
        text,
        ...(about ? { about: this.rel(about) } : {}),
        ...(input !== text ? { input: clip(input, TOOL_INPUT_MAX_CHARS) } : {}),
      });
      if (typeof block.id === 'string') this.tools.set(block.id, row as ToolRow);
    }
  }

  private toolResult(block: Block): void {
    const id = block.tool_use_id;
    const row = typeof id === 'string' ? this.tools.get(id) : undefined;
    if (!row) return;
    this.tools.delete(id as string);
    const parts: Block[] =
      typeof block.content === 'string'
        ? [{ type: 'text', text: block.content }]
        : Array.isArray(block.content)
          ? (block.content as Block[])
          : [];
    const text = parts
      .flatMap((p) => (p.type === 'text' && typeof p.text === 'string' ? [p.text] : []))
      .join('\n')
      .trim();
    const shots = parts.flatMap((p): ToolImage[] => {
      const src = p.source as Record<string, unknown> | undefined;
      return p.type === 'image' && src?.type === 'base64' && typeof src.data === 'string'
        ? [{ mediaType: String(src.media_type ?? 'image/png'), data: src.data }]
        : [];
    });
    const images = shots.length ? this.host.saveImages(shots) : [];
    this.host.update({
      ...row,
      ...(text ? { result: clip(this.rel(text), TOOL_RESULT_MAX_CHARS) } : {}),
      ...(block.is_error === true ? { isError: true } : {}),
      ...(images.length ? { images } : {}),
    });
  }

  /** The context of the last request: input + cache writes + cache reads (no output). */
  private usage(u: Record<string, unknown>): void {
    const n = (k: string) => (typeof u[k] === 'number' ? (u[k] as number) : 0);
    const used =
      n('input_tokens') + n('cache_creation_input_tokens') + n('cache_read_input_tokens');
    // One message streams one event per block, each with the same usage.
    if (used <= 0 || used === this.used) return;
    this.used = used;
    this.host.context({ used, window: this.window });
  }

  /** The window: the model's, as the result `modelUsage` reports it. */
  private result(rec: Record<string, unknown>): void {
    const models = (rec.modelUsage ?? {}) as Record<string, { contextWindow?: unknown }>;
    const own = (this.model && models[this.model]) || Object.values(models)[0];
    if (typeof own?.contextWindow !== 'number') return;
    const window = own.contextWindow;
    if (window === this.window) return;
    this.window = window;
    if (this.used) this.host.context({ used: this.used, window });
  }
}
