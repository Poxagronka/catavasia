/**
 * The rows of one CEO turn, read from the raw stream lines (Agent SDK
 * messages as stream-json): replies, tool calls with their full input and
 * result, images that tools return, "Thought for 3s" rows, and how full the
 * context window is. Shapes checked on CLI 2.1.292 (docs: the parity design).
 *
 * A helper's calls (`parent_tool_use_id`) nest under its Task or Agent row;
 * its text becomes that row's result. The session's background tasks, the
 * to-do list and passing states ("Retrying (2)…") go in the status. Desk
 * tools write their own readable row (callTool). Shapes of the system
 * messages: sdk.d.ts of the Agent SDK 0.3.292, seen on CLI 2.1.293.
 */

import type {
  BackgroundTask,
  CatSessionEntry,
  ContextUse,
  TodoItem,
} from '../../../core/src/catSession.js';
import type { CeoAttachment } from '../../../core/src/ceoDesk.js';
import { DEFAULT_MAX_CONTEXT_TOKENS } from '../constants.js';
import { relativePaths, summarizeInput } from '../taskBoard/streamJson.js';
import type { DeskRow } from './deskStore.js';
import { nextTodos, TODO_TOOLS } from './deskTodos.js';
import { DESK_MCP_NAME } from './deskTools.js';

const DESK_TOOL_PREFIX = `mcp__${DESK_MCP_NAME}__`;
/** Caps of what a tool row keeps (the history file and the socket frame stay small). */
export const TOOL_INPUT_MAX_CHARS = 4000;
export const TOOL_RESULT_MAX_CHARS = 4000;
/** The live reply goes to the dock at most this often (each frame re-renders its Markdown). */
export const DRAFT_EVERY_MS = 50;
/** Cap of a quiet note made from a stream message (a denial, a failed hook). */
const NOTE_MAX_CHARS = 300;
/** The tools that start a helper (sub-agent): its calls nest under their row. */
const HELPER_TOOLS = new Set(['Task', 'Agent']);

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
  /** `tasks` or `notice` changed: the status shows them. */
  status(): void;
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
  /** The session's background tasks: each `background_tasks_changed` replaces the list. */
  tasks: BackgroundTask[] = [];
  /** A passing state ("Retrying (2)…"): Claude's next output or the result ends it. */
  notice: string | undefined;
  /** The to-do list after the newest call that changed it. */
  todos: TodoItem[] = [];
  private readonly tools = new Map<string, ToolRow>();
  /** Helper rows by tool_use id, kept after their result: a background helper reports later. */
  private readonly helpers = new Map<string, ToolRow>();
  /** Calls that change the to-do list, until their result. */
  private readonly todoCalls = new Map<string, { name: string; input: Record<string, unknown> }>();
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

  /** One stream line. `quiet` (after Stop): only the background task list still changes. */
  line(line: string, quiet = false): void {
    let rec: Record<string, unknown>;
    try {
      rec = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    if (rec.type === 'system' && rec.subtype === 'background_tasks_changed') {
      return this.background(rec.tasks);
    }
    // The result ends a passing state, also of a turn that Stop cut.
    if (rec.type === 'result') this.setNotice(undefined);
    if (quiet) return;
    if (rec.type === 'system' && rec.subtype === 'init' && typeof rec.model === 'string') {
      this.model = rec.model;
      return;
    }
    if (rec.type === 'result') return this.result(rec);
    if (rec.type === 'system' && rec.subtype === 'compact_boundary') return this.compacted(rec);
    if (rec.type === 'system') return this.system(rec);
    if (rec.type === 'rate_limit_event') {
      const info = rec.rate_limit_info as { status?: unknown } | undefined;
      if (info?.status === 'rejected') this.setNotice('Usage limit reached');
      return;
    }
    const sub = typeof rec.parent_tool_use_id === 'string' ? rec.parent_tool_use_id : undefined;
    if (sub && !this.helpers.has(sub)) return;
    // Output of the CEO or of a helper: a retry of either is over.
    this.setNotice(undefined);
    if (rec.type === 'stream_event') {
      if (!sub) this.partial(rec.event as Block | undefined);
      return;
    }
    const message = rec.message as { content?: unknown; usage?: Record<string, unknown> };
    if (!Array.isArray(message?.content)) return;
    for (const block of message.content as Block[]) {
      if (rec.type === 'assistant' && sub) this.helperBlock(block, sub);
      else if (rec.type === 'assistant') this.assistantBlock(block, rec);
      else if (rec.type === 'user' && block.type === 'tool_result') this.toolResult(block);
    }
    if (rec.type === 'assistant' && message.usage && !sub) this.usage(message.usage);
  }

  /** The live background tasks (a level signal: replace, never pair start and end). */
  private background(tasks: unknown): void {
    const list = Array.isArray(tasks) ? (tasks as Record<string, unknown>[]) : [];
    // Ambient tasks (watchers) are not activity.
    this.tasks = list.flatMap((t) =>
      typeof t.task_id === 'string' && !t.ambient
        ? [
            {
              id: t.task_id,
              type: String(t.task_type ?? ''),
              description: String(t.description ?? ''),
            },
          ]
        : [],
    );
    this.host.status();
  }

  private setNotice(text: string | undefined): void {
    if (text === this.notice) return;
    this.notice = text;
    this.host.status();
  }

  /** A quiet note; the held reply stays held (a Stop hook comes after the final text). */
  private note(text: string): void {
    this.host.add({ kind: 'note', text: clip(text, NOTE_MAX_CHARS) });
  }

  /** Quiet system messages: a passing state, a note, or a local command's output. */
  private system(rec: Record<string, unknown>): void {
    const s = (k: string) => (typeof rec[k] === 'string' ? (rec[k] as string).trim() : '');
    switch (rec.subtype) {
      case 'status':
        if (rec.status === 'compacting') this.setNotice('Summarising the chat…');
        else if (rec.status === null) this.setNotice(undefined);
        return;
      case 'api_retry':
        return this.setNotice(`Retrying (${String(rec.attempt)})…`);
      case 'notification':
        return this.setNotice(s('text') || undefined);
      case 'permission_denied':
        return this.note(`Not allowed: ${s('tool_name')}${s('message') && ` (${s('message')})`}`);
      case 'hook_response':
        if (rec.outcome !== 'error') return;
        return this.note(`Hook ${s('hook_name')} failed${s('stderr') && `: ${s('stderr')}`}`);
      case 'local_command_output':
        // The SDK shows it like a reply: the turn's result text replaces it when it has one.
        if (!s('content')) return;
        this.flush();
        this.held = s('content');
        return;
    }
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
    } else if (block.type === 'tool_use') {
      this.flush();
      this.toolCall(block);
    }
  }

  /** A helper's own call nests under its row; its newest text is its answer so far. */
  private helperBlock(block: Block, helperId: string): void {
    const helper = this.helpers.get(helperId)!;
    if (block.type === 'tool_use') this.toolCall(block, helper.at);
    else if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
      const result = clip(this.rel(block.text.trim()), TOOL_RESULT_MAX_CHARS);
      this.updateRow({ ...helper, result });
    }
  }

  private toolCall(block: Block, parent?: number): void {
    const name = block.name;
    if (typeof name !== 'string' || name.startsWith(DESK_TOOL_PREFIX)) return;
    // A command or helper says what it is for: that is its line, the rest its detail.
    const { description, ...rest } = (block.input ?? {}) as Record<string, unknown>;
    const about = typeof description === 'string' ? description.trim() : '';
    const shown = about ? rest : block.input;
    const input = this.rel(inputText(shown));
    const text = this.rel(summarizeInput(shown));
    const row = this.host.add({
      kind: 'tool',
      name,
      text,
      ...(about ? { about: this.rel(about) } : {}),
      ...(input !== text ? { input: clip(input, TOOL_INPUT_MAX_CHARS) } : {}),
      ...(parent !== undefined ? { parent } : {}),
    }) as ToolRow;
    if (typeof block.id !== 'string') return;
    this.tools.set(block.id, row);
    // Only the CEO's own helpers and to-do list: a helper's helper stays one level deep.
    if (parent !== undefined) return;
    if (HELPER_TOOLS.has(name)) this.helpers.set(block.id, row);
    if (TODO_TOOLS.has(name)) {
      this.todoCalls.set(block.id, { name, input: (block.input ?? {}) as Record<string, unknown> });
    }
  }

  /** Replace a row; a helper row keeps its newest state for its later answer. */
  private updateRow(row: ToolRow): void {
    this.host.update(row);
    for (const [id, helper] of this.helpers) if (helper.at === row.at) this.helpers.set(id, row);
  }

  private toolResult(block: Block): void {
    const id = block.tool_use_id;
    const row = typeof id === 'string' ? this.tools.get(id) : undefined;
    if (!row) return;
    this.tools.delete(id as string);
    const todo = this.todoCalls.get(id as string);
    this.todoCalls.delete(id as string);
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
    const failed = block.is_error === true;
    if (todo && !failed) this.todos = nextTodos(this.todos, todo.name, todo.input, text);
    // A helper's own answer (its text) came first: the launch notice does not replace it.
    const current = this.helpers.get(id as string) ?? row;
    this.updateRow({
      ...current,
      ...(text && !current.result ? { result: clip(this.rel(text), TOOL_RESULT_MAX_CHARS) } : {}),
      ...(failed ? { isError: true } : {}),
      ...(images.length ? { images } : {}),
      ...(todo && !failed ? { todos: this.todos } : {}),
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
