/**
 * Parser for `claude -p --output-format stream-json --verbose` stdout. Turns
 * each record into activity-log entries and captures the final `result` event.
 * Only this file knows the stream-json record shapes.
 */

import type { TaskLogEntry } from '../../../core/src/tasks.js';
import { TASK_LOG_TEXT_MAX_CHARS } from '../constants.js';

export interface StreamResult {
  isError: boolean;
  text?: string;
  costUsd?: number;
  durationMs?: number;
  numTurns?: number;
  sessionId?: string;
  usage?: StreamUsage;
}

/** Token counts of the `result` event (the prompt cache shows in the cache fields). */
export interface StreamUsage {
  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
}

export interface ParsedStreamLine {
  log: TaskLogEntry[];
  result?: StreamResult;
}

function clip(text: string): string {
  return text.length > TASK_LOG_TEXT_MAX_CHARS
    ? `${text.slice(0, TASK_LOG_TEXT_MAX_CHARS)}...`
    : text;
}

/** Short, human-readable summary of a tool input. */
function summarizeInput(input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const rec = input as Record<string, unknown>;
  for (const key of [
    'command',
    'file_path',
    'notebook_path',
    'path',
    'pattern',
    'url',
    'description',
    'prompt',
  ]) {
    if (typeof rec[key] === 'string') return clip(rec[key]);
  }
  return clip(JSON.stringify(input));
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function parseUsage(raw: unknown): StreamUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const u = raw as Record<string, unknown>;
  return {
    inputTokens: num(u.input_tokens) ?? 0,
    cacheReadTokens: num(u.cache_read_input_tokens) ?? 0,
    cacheCreationTokens: num(u.cache_creation_input_tokens) ?? 0,
    outputTokens: num(u.output_tokens) ?? 0,
  };
}

/** Parse one stdout line. Non-JSON and unknown records yield no entries. */
export function parseStreamLine(line: string): ParsedStreamLine {
  let rec: Record<string, unknown>;
  try {
    rec = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return { log: [] };
  }
  if (rec.type === 'result') {
    return {
      log: [],
      result: {
        isError: rec.is_error === true || rec.subtype !== 'success',
        text: typeof rec.result === 'string' ? rec.result : undefined,
        costUsd: num(rec.total_cost_usd),
        durationMs: num(rec.duration_ms),
        numTurns: num(rec.num_turns),
        sessionId: typeof rec.session_id === 'string' ? rec.session_id : undefined,
        usage: parseUsage(rec.usage),
      },
    };
  }
  const message = rec.message as { content?: unknown } | undefined;
  if (!Array.isArray(message?.content)) return { log: [] };
  const log: TaskLogEntry[] = [];
  for (const block of message.content as Array<Record<string, unknown>>) {
    if (rec.type === 'assistant' && block.type === 'tool_use' && typeof block.name === 'string') {
      log.push({ kind: 'tool', name: block.name, text: summarizeInput(block.input) });
    } else if (
      rec.type === 'assistant' &&
      block.type === 'text' &&
      typeof block.text === 'string'
    ) {
      if (block.text.trim()) log.push({ kind: 'text', text: clip(block.text.trim()) });
    } else if (rec.type === 'user' && block.type === 'tool_result' && block.is_error === true) {
      const content = typeof block.content === 'string' ? block.content : '';
      log.push({ kind: 'error', text: clip(content) });
    }
  }
  return { log };
}
