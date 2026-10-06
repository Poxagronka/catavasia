/**
 * Parser for `codex exec --json` stdout (JSONL). Only this file knows the
 * Codex event shapes. Verified with codex-cli 0.155.1 (2026-10-06, see
 * docs/catavasia/ROADMAP.md "Engine per cat"):
 *
 *   {"type":"thread.started","thread_id":"<uuid>"}
 *   {"type":"turn.started"}
 *   {"type":"item.started"|"item.completed","item":{"id","type",...}}
 *   {"type":"turn.completed","usage":{input_tokens,cached_input_tokens,output_tokens,...}}
 *   {"type":"turn.failed","error":{"message"}}  /  {"type":"error","message"}
 *
 * Item types: agent_message {text}, reasoning, command_execution {command,
 * exit_code, status}, file_change {changes:[{path,kind}]}, mcp_tool_call
 * {server, tool, arguments, result, error, status}, web_search, todo_list,
 * error {message}.
 *
 * Tools get Claude Code tool names (Bash, Read, Grep, Edit, Write,
 * mcp__<server>__<tool>, ...), so the narrator and the cat animations treat
 * both engines alike.
 */

import * as path from 'path';

import type { TaskLogEntry } from '../../../core/src/tasks.js';
import { TASK_LOG_TEXT_MAX_CHARS } from '../constants.js';
import { formatToolStatus } from '../providers/hook/claude/claude.js';
import type { StreamUsage } from '../taskBoard/streamJson.js';
import type { ToolActivity } from './engineAdapter.js';

export interface CodexLine {
  log: TaskLogEntry[];
  activity: ToolActivity[];
  /** `thread.started`: the session id a later turn resumes. */
  threadId?: string;
  /** Final assistant text so far (the last agent message wins). */
  text?: string;
  /** `turn.completed`. */
  usage?: StreamUsage;
  /** `turn.failed` or a stream `error`. */
  error?: string;
  turnCompleted?: boolean;
}

interface Item {
  id?: string;
  type?: string;
  text?: string;
  message?: string;
  command?: string;
  changes?: Array<{ path?: string; kind?: string }>;
  server?: string;
  tool?: string;
  arguments?: unknown;
  query?: string;
  /** mcp_tool_call: `{message}` when the call failed. */
  error?: { message?: string } | null;
}

/** Commands that only read: the cat reads instead of running. */
const READ_COMMANDS = new Set(['cat', 'sed', 'head', 'tail', 'nl', 'less', 'wc']);
const SEARCH_COMMANDS = new Set(['rg', 'grep', 'ag', 'find', 'ls', 'fd']);

function clip(text: string): string {
  return text.length > TASK_LOG_TEXT_MAX_CHARS
    ? `${text.slice(0, TASK_LOG_TEXT_MAX_CHARS)}...`
    : text;
}

/** `/bin/zsh -lc "sed -n '1,120p' a.txt"` -> `sed -n '1,120p' a.txt`. */
export function unwrapShell(command: string): string {
  const m = /^\S*\/?(?:ba|z)?sh\s+-l?c\s+(["'])([\s\S]*)\1$/.exec(command.trim());
  return m ? m[2] : command;
}

/** Map one item to a Claude tool name and its input, or undefined for non-tool items. */
export function toolOf(item: Item): { name: string; input: Record<string, unknown> } | undefined {
  switch (item.type) {
    case 'command_execution': {
      const command = unwrapShell(item.command ?? '');
      const words = command.split(/\s+/);
      const first = path.basename(words[0] ?? '');
      // A pipeline or a chain does more than read: it runs.
      const simple = !/[|;&>]/.test(command);
      if (simple && READ_COMMANDS.has(first)) {
        return { name: 'Read', input: { file_path: words[words.length - 1] } };
      }
      if (simple && SEARCH_COMMANDS.has(first)) return { name: 'Grep', input: { command } };
      return { name: 'Bash', input: { command } };
    }
    case 'file_change': {
      const change = item.changes?.[0];
      const name = change?.kind === 'add' ? 'Write' : 'Edit';
      return { name, input: { file_path: change?.path ?? '' } };
    }
    case 'mcp_tool_call':
      return {
        name: `mcp__${item.server ?? 'mcp'}__${item.tool ?? 'tool'}`,
        input: (item.arguments as Record<string, unknown>) ?? {},
      };
    case 'web_search':
      return { name: 'WebSearch', input: { query: item.query ?? '' } };
    case 'todo_list':
      return { name: 'TodoWrite', input: {} };
    default:
      return undefined;
  }
}

/** Short text of a tool input for the activity log. */
function summarize(input: Record<string, unknown>): string {
  for (const key of ['command', 'file_path', 'query']) {
    if (typeof input[key] === 'string') return clip(input[key]);
  }
  return clip(JSON.stringify(input));
}

/** `{"type":"error","status":400,"error":{"message":"..."}}` -> the inner message. */
function errorText(raw: unknown): string {
  const message = typeof raw === 'string' ? raw : 'Codex reported an error';
  try {
    const inner = JSON.parse(message) as { error?: { message?: string } };
    return inner.error?.message ?? message;
  } catch {
    return message;
  }
}

function num(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

/**
 * Parse one stdout line. `seen` holds the item ids already logged, so an
 * item logs once (at `item.started`, else at `item.completed`).
 */
export function parseCodexLine(line: string, seen: Set<string>): CodexLine {
  const out: CodexLine = { log: [], activity: [] };
  let rec: Record<string, unknown>;
  try {
    rec = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return out;
  }
  switch (rec.type) {
    case 'thread.started':
      if (typeof rec.thread_id === 'string') out.threadId = rec.thread_id;
      return out;
    case 'turn.completed': {
      const u = (rec.usage ?? {}) as Record<string, unknown>;
      const cached = num(u.cached_input_tokens);
      out.turnCompleted = true;
      // OpenAI counts cached tokens inside input_tokens; Claude counts them apart.
      out.usage = {
        inputTokens: Math.max(0, num(u.input_tokens) - cached),
        cacheReadTokens: cached,
        cacheCreationTokens: num(u.cache_write_input_tokens),
        outputTokens: num(u.output_tokens),
      };
      return out;
    }
    case 'turn.failed':
      out.error = errorText((rec.error as { message?: unknown } | undefined)?.message);
      return out;
    case 'error':
      out.error = errorText(rec.message);
      return out;
    case 'item.started':
    case 'item.completed':
      break;
    default:
      return out;
  }
  const item = (rec.item ?? {}) as Item;
  const id = item.id ?? '';
  const completed = rec.type === 'item.completed';
  if (item.type === 'agent_message' && completed && item.text?.trim()) {
    out.text = item.text.trim();
    out.log.push({ kind: 'text', text: clip(out.text) });
    return out;
  }
  if (item.type === 'error' && completed) {
    out.log.push({ kind: 'error', text: clip(item.message ?? 'error') });
    return out;
  }
  const tool = toolOf(item);
  if (!tool) return out;
  if (!seen.has(id)) {
    seen.add(id);
    out.log.push({ kind: 'tool', name: tool.name, text: summarize(tool.input) });
    out.activity.push({
      toolId: id,
      toolName: tool.name,
      status: formatToolStatus(tool.name, tool.input),
    });
  }
  if (completed && item.error?.message)
    out.log.push({ kind: 'error', text: clip(item.error.message) });
  if (completed) out.activity.push({ toolId: id, done: true });
  return out;
}
