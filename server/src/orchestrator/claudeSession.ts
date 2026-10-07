/**
 * A live Claude Code session (the CEO dock): one Agent SDK `query()` whose
 * input stays open, like the terminal. A message sent while Claude works goes
 * into the running session at once (the CLI folds it into the turn or runs it
 * next); each `result` ends one turn. Stop interrupts the turn and keeps the
 * process, so background tasks live on between turns.
 *
 * Checked with CLI 2.1.293: one process served many turns; a message sent
 * mid-turn was folded into it (one result); an interrupt gave an error result,
 * then idle; `session_state_changed` comes only with the env flag set.
 */

import type {
  Options,
  PermissionMode as SdkPermissionMode,
  Query,
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk' with { 'resolution-mode': 'import' };
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import type { PermissionMode } from '../../../core/src/messages.js';
import { CLAUDE_SESSION_STATE_ENV, CLAUDE_TODO_TOOLS_ENV } from '../constants.js';
import { parseStreamLine, type StreamResult } from '../taskBoard/streamJson.js';
import { officeLimits } from '../usageLimits.js';
import type {
  LiveSession,
  SessionEnd,
  SessionRequest,
  TurnOutcome,
  TurnSetup,
} from './engineAdapter.js';

export const STDERR_TAIL_CHARS = 2000;

/** Our modes as Claude Code permission modes (Read only: `dontAsk` denies all but reads). */
export const SDK_MODES: Record<PermissionMode, SdkPermissionMode> = {
  auto: 'auto',
  ask: 'default',
  acceptEdits: 'acceptEdits',
  plan: 'plan',
  bypass: 'bypassPermissions',
  readOnly: 'dontAsk',
};

/** Our mode of a Claude Code mode. */
const OUR_MODES = Object.fromEntries(
  Object.entries(SDK_MODES).map(([ours, sdk]) => [sdk, ours as PermissionMode]),
) as Record<SdkPermissionMode, PermissionMode>;

const IMAGE_MEDIA_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/**
 * The user message of a turn: plain text, or a content-block array (text,
 * then one base64 image block per image) when it has images.
 */
export function claudeUserMessage(text: string, images: string[] = []): SDKUserMessage {
  const content = images.length
    ? [
        { type: 'text', text },
        ...images.map((file) => ({
          type: 'image',
          source: {
            type: 'base64',
            media_type: IMAGE_MEDIA_TYPES[path.extname(file).toLowerCase()] ?? 'image/png',
            data: fs.readFileSync(file).toString('base64'),
          },
        })),
      ]
    : text;
  return {
    type: 'user',
    message: { role: 'user', content: content as SDKUserMessage['message']['content'] },
    parent_tool_use_id: null,
  };
}

export const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** One turn's outcome from its `result`, or from the error that ended the stream. */
export function claudeOutcome(
  result: StreamResult | undefined,
  failed: string | undefined,
  sessionStarted: boolean,
): TurnOutcome {
  const ok = !failed && result !== undefined && !result.isError;
  return {
    ok,
    text: result?.text,
    sessionCostUsd: result?.costUsd,
    usage: result?.usage,
    sessionStarted,
    // The result's own error ("Not logged in") says more than the exit code.
    error: ok
      ? undefined
      : result?.isError
        ? (result.text ?? 'The turn reported an error')
        : (failed ?? 'The turn ended without a result'),
  };
}

/** The options a running process keeps: a change to one of them needs a new process. */
function spawnOnly(o: Options): string {
  return JSON.stringify([
    o.effort,
    o.allowDangerouslySkipPermissions ?? false,
    o.allowedTools ?? [],
    !!o.canUseTool,
  ]);
}

/**
 * Open the session. `optionsFor` gives the Agent SDK options of a setup
 * (claudeTurnOptions); no `executable` means the CLI is not installed.
 */
export function openClaudeSession(
  executable: string | undefined,
  optionsFor: (setup: TurnSetup) => Options,
  req: SessionRequest,
): LiveSession {
  const abort = new AbortController();
  const queue: SDKUserMessage[] = [];
  let wake: (() => void) | undefined;
  let closing = false;
  const nudge = () => {
    const w = wake;
    wake = undefined;
    w?.();
  };
  async function* input(): AsyncGenerator<SDKUserMessage> {
    while (!closing) {
      const next = queue.shift();
      if (next) yield next;
      else await new Promise<void>((resolve) => (wake = resolve));
    }
  }

  let options = optionsFor(req);
  let modeCalls = 0;
  let query: Query | undefined;
  let queryStarted: (q: Query) => void = () => {};
  const ready = new Promise<Query>((resolve) => (queryStarted = resolve));
  const control = (what: string, call: (q: Query) => Promise<unknown>): void => {
    void ready
      .then(call)
      .catch((err) => console.error(`[catavasia] CEO session ${what}: ${errorText(err)}`));
  };

  // Busy from a send until Claude is idle with every sent message answered.
  // `session_state_changed` idle is the authoritative turn end; each result
  // names the messages it consumed (`user_message_uuids`), so an idle that
  // comes before the turn of a newer message is stale. A CLI without state
  // events: the result alone; without the uuids: a result answers them all.
  let busy = false;
  let stateEvents = false;
  let sessionStarted = false;
  const unanswered = new Set<string>();
  const setBusy = (next: boolean) => {
    if (next === busy) return;
    busy = next;
    req.onBusy(next);
  };
  const answered = (message: { user_message_uuid?: string; user_message_uuids?: string[] }) => {
    const ids = message.user_message_uuids ?? [message.user_message_uuid ?? ''].filter(Boolean);
    if (!ids.length) unanswered.clear();
    for (const id of ids) unanswered.delete(id);
  };
  const onMessage = (message: SDKMessage): void => {
    const line = JSON.stringify(message);
    if (line.includes('"session_id"')) sessionStarted = true;
    officeLimits.observe(line);
    req.onLine?.(line);
    if (message.type === 'prompt_suggestion') req.onSuggestion?.(message.suggestion);
    // The CLI changed its own mode (an approved plan switches it). A status
    // while our own switch is on its way is that switch, not a new one.
    if (message.type === 'system' && message.subtype === 'status' && message.permissionMode) {
      const mode = message.permissionMode;
      if (!modeCalls && mode !== options.permissionMode) {
        options = { ...options, permissionMode: mode };
        req.onMode?.(OUR_MODES[mode]);
      }
    }
    if (message.type === 'system' && message.subtype === 'session_state_changed') {
      stateEvents = true;
      setBusy(message.state !== 'idle' || unanswered.size > 0);
    }
    if (message.type !== 'result') return;
    answered(message);
    req.onResult(claudeOutcome(parseStreamLine(line).result, undefined, sessionStarted));
    if (!stateEvents && !unanswered.size) setBusy(false);
  };

  let stderr = '';
  const failed = (async (): Promise<string | undefined> => {
    if (!executable) return 'Claude Code CLI not found';
    // The SDK is ESM: a CommonJS build loads it on first use.
    const { query: start } = await import('@anthropic-ai/claude-agent-sdk');
    if (closing) return undefined;
    query = start({
      prompt: input(),
      options: {
        ...options,
        env: { ...options.env, [CLAUDE_SESSION_STATE_ENV]: '1', [CLAUDE_TODO_TOOLS_ENV]: '1' },
        promptSuggestions: !!req.onSuggestion,
        // The dock stops each background task itself: Stop ends the turn only.
        perTaskStopAffordance: true,
        // A helper's text (its answer) and failed hooks show in the dock.
        forwardSubagentText: true,
        includeHookEvents: true,
        abortController: abort,
        stderr: (data) => {
          stderr = (stderr + data).slice(-STDERR_TAIL_CHARS);
        },
      },
    });
    queryStarted(query);
    try {
      for await (const message of query) onMessage(message);
    } catch (err) {
      if (closing) return undefined;
      return stderr.trim() ? `${errorText(err)}: ${stderr.trim()}` : errorText(err);
    }
    return closing ? undefined : stderr.trim() || 'Claude Code ended the session';
  })().catch(errorText);
  // No more callbacks after the end: the owner reads `ended`.
  const ended = failed.then((error): SessionEnd => {
    closing = true;
    nudge();
    return { ...(error ? { error } : {}), sessionStarted };
  });

  return {
    send(message, images) {
      const uuid = randomUUID();
      queue.push({ ...claudeUserMessage(message, images), uuid });
      unanswered.add(uuid);
      setBusy(true);
      nudge();
      return uuid;
    },
    async interrupt() {
      // Not yet read by the SDK: those messages never start.
      const dropped = queue.splice(0).map((m) => m.uuid ?? '');
      for (const id of dropped) unanswered.delete(id);
      const receipt = await query?.interrupt();
      return [...dropped, ...(receipt?.still_queued ?? [])];
    },
    async stopTask(taskId) {
      await query?.stopTask(taskId);
    },
    update(change) {
      const next = optionsFor({ ...req, ...change });
      if (spawnOnly(next) !== spawnOnly(options)) return false;
      const was = options;
      options = next;
      if (next.model !== was.model) control('model', (q) => q.setModel(next.model));
      if (next.permissionMode && next.permissionMode !== was.permissionMode) {
        const mode = next.permissionMode;
        modeCalls++;
        control('mode', (q) => q.setPermissionMode(mode).finally(() => modeCalls--));
      }
      return true;
    },
    close() {
      if (!closing) {
        closing = true;
        queue.length = 0;
        nudge();
        query?.close();
        abort.abort();
      }
      return ended.then(() => undefined);
    },
    ended,
  };
}
