/**
 * The SpawnTurn effect: the cat's resident character starts working, the
 * engine process runs one turn, and its stream feeds the task log, the cat
 * console, the narrator and the log-only events. The result comes back as
 * TurnStarted, then TurnFinished.
 */

import type { CatProfile } from '../../../../core/src/messages.js';
import type { TaskLogEntry } from '../../../../core/src/tasks.js';
import { toConsoleEntry } from '../../catTerminal/catSessionSource.js';
import { TASK_LOG_MAX_ENTRIES, TASK_LOG_TEXT_MAX_CHARS } from '../../constants.js';
import { taskLogInput } from '../../narrator/narrator.js';
import type { StoredTask } from '../../taskBoard/taskStore.js';
import { breedPalette } from '../catResidents.js';
import type { CompactInfo, TurnHandle } from '../engineAdapter.js';
import type { RunnerHost } from './interpreter.js';
import type { Effect, TaskEvent } from './types.js';

export interface SpawnContext {
  host: RunnerHost;
  task: StoredTask;
  rootId: string;
  personaFile: string;
  mcpConfigFile: string;
  handles: Map<string, TurnHandle>;
  dispatch(event: TaskEvent): void;
}

/** One row of the task's activity log (truncated, capped). */
export function appendTaskLog(task: StoredTask, entry: TaskLogEntry): void {
  const text =
    entry.text.length > TASK_LOG_TEXT_MAX_CHARS
      ? `${entry.text.slice(0, TASK_LOG_TEXT_MAX_CHARS)}...`
      : entry.text;
  task.log.push({ ...entry, text });
  if (task.log.length > TASK_LOG_MAX_ENTRIES) {
    task.log.splice(0, task.log.length - TASK_LOG_MAX_ENTRIES);
  }
}

function compactText(info: CompactInfo): string {
  return `[Office] Context compacted (${info.trigger}): ${info.preTokens ?? '?'} -> ${info.postTokens ?? '?'} tokens`;
}

export function spawnTurn(
  ctx: SpawnContext,
  cat: CatProfile,
  fx: Extract<Effect, { type: 'SpawnTurn' }>,
): void {
  const { host, task } = ctx;
  const { residents, consoles } = host;
  if (fx.catId === ctx.rootId) {
    // The task card shows the root's character.
    Object.assign(task, {
      agentId: residents.ensure(cat),
      palette: breedPalette(cat),
      hueShift: 0,
    });
  }
  // The resident cat walks to its desk and watches this turn's transcript.
  const agentId = residents.turnStarted(cat, fx.sessionId, fx.cwd);
  consoles.push(fx.catId, { kind: 'user', text: fx.message });
  const started: TaskEvent = { type: 'TurnStarted', catId: fx.catId, turnId: fx.turnId, agentId };
  let handle: TurnHandle;
  try {
    handle = host.adapterFor(cat)!.spawnTurn({
      sessionId: fx.sessionId,
      resume: fx.resume,
      cwd: fx.cwd,
      model: cat.model,
      effort: cat.effort,
      systemPromptFile: ctx.personaFile,
      mcpConfigFile: ctx.mcpConfigFile,
      message: fx.message,
      onLog: (entry) => {
        const name = entry.kind === 'tool' ? `${cat.name}: ${entry.name}` : cat.name;
        appendTaskLog(task, { ...entry, name });
        consoles.push(fx.catId, toConsoleEntry(entry));
        host.narrate?.(taskLogInput(agentId, entry, Date.now()));
        if (entry.kind === 'tool' && entry.name) {
          ctx.dispatch({ type: 'ToolActivity', catId: fx.catId, tool: entry.name });
        }
      },
      onCompact: (info) => {
        appendTaskLog(task, { kind: 'text', name: cat.name, text: compactText(info) });
        ctx.dispatch({ type: 'CompactHappened', catId: fx.catId, ...info });
      },
    });
  } catch (err) {
    residents.turnEnded(fx.catId);
    ctx.dispatch(started);
    const error = err instanceof Error ? err.message : String(err);
    const result = { ok: false, error, sessionStarted: false };
    ctx.dispatch({ type: 'TurnFinished', catId: fx.catId, turnId: fx.turnId, result });
    return;
  }
  ctx.handles.set(fx.catId, handle);
  ctx.dispatch(started);
  void handle.done.then((outcome) => {
    ctx.handles.delete(fx.catId);
    residents.turnEnded(fx.catId);
    if (!outcome.ok) {
      consoles.push(fx.catId, { kind: 'error', text: outcome.error ?? 'The turn failed' });
      host.narrate?.({ catId: agentId, ts: Date.now(), kind: 'state', text: 'error' });
    }
    ctx.dispatch({ type: 'TurnFinished', catId: fx.catId, turnId: fx.turnId, result: outcome });
  });
}
