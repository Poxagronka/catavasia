/**
 * Where the cat console gets a cat's session from.
 *
 * CatSessionSource is the seam the orchestrator (phase 1) plugs into: its own
 * per-cat stream-json sessions implement the same five calls. Today the only
 * source is the task board, where a cat id is the office agent id of a task cat.
 */

import type {
  CatSessionEntry,
  CatSessionFrame,
  CatSessionStatus,
} from '../../../core/src/catSession.js';
import type { TaskDetail, TaskLogEntry } from '../../../core/src/tasks.js';
import { TaskBusyError, TaskInputError, type TaskManager } from '../taskBoard/taskManager.js';

export interface CatSessionSnapshot {
  title: string;
  entries: CatSessionEntry[];
  status: CatSessionStatus;
}

/** A request the caller must fix. `code` is the HTTP status (400, 404, 409). */
export class CatSessionError extends Error {
  constructor(
    readonly code: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

export interface CatSessionSource {
  /** The cat's session so far, or undefined when this source does not know the cat. */
  snapshot(catId: string): CatSessionSnapshot | undefined;
  /** Live `entries` and `status` frames. Returns the unsubscribe function. */
  subscribe(catId: string, listener: (frame: CatSessionFrame) => void): () => void;
  /** Deliver a user message (a new turn). Throws CatSessionError. */
  send(catId: string, text: string): Promise<void>;
  /** Take the session lock for an interactive PTY. Throws CatSessionError. */
  beginWheel(catId: string): Promise<{ sessionId: string; cwd: string }>;
  /** The PTY ended: release the lock. */
  endWheel(catId: string): Promise<void>;
}

/** Task log row -> console row. Exported for tests. */
export function toConsoleEntry(entry: TaskLogEntry): CatSessionEntry {
  if (entry.kind === 'tool') return { kind: 'tool', name: entry.name ?? 'Tool', text: entry.text };
  return { kind: entry.kind, text: entry.text };
}

/** The task board as a session source: catId = office agent id of the task cat. */
export class TaskBoardCatSource implements CatSessionSource {
  constructor(private readonly tasks: TaskManager) {}

  snapshot(catId: string): CatSessionSnapshot | undefined {
    const task = this.taskOf(catId);
    if (!task) return undefined;
    const entries: CatSessionEntry[] = [
      { kind: 'user', text: task.prompt },
      ...task.log.map(toConsoleEntry),
    ];
    if (task.status === 'error' && task.error) entries.push({ kind: 'error', text: task.error });
    return { title: task.title, entries, status: this.status(task.id) };
  }

  subscribe(catId: string, listener: (frame: CatSessionFrame) => void): () => void {
    const taskId = this.taskOf(catId)?.id;
    if (!taskId) return () => {};
    const onLog = (id: string, log: TaskLogEntry[]) => {
      if (id === taskId) listener({ type: 'entries', entries: log.map(toConsoleEntry) });
    };
    const onStatus = (id: string) => {
      if (id !== taskId) return;
      listener({ type: 'status', status: this.status(id) });
    };
    this.tasks.events.on('log', onLog);
    this.tasks.events.on('status', onStatus);
    return () => {
      this.tasks.events.off('log', onLog);
      this.tasks.events.off('status', onStatus);
    };
  }

  async send(catId: string, text: string): Promise<void> {
    await this.call(catId, (id) => this.tasks.followUp(id, text));
  }

  beginWheel(catId: string): Promise<{ sessionId: string; cwd: string }> {
    return this.call(catId, (id) => this.tasks.beginWheel(id));
  }

  async endWheel(catId: string): Promise<void> {
    const task = this.taskOf(catId);
    if (task) await this.tasks.endWheel(task.id);
  }

  private taskOf(catId: string): TaskDetail | undefined {
    return /^\d+$/.test(catId) ? this.tasks.findByAgent(Number(catId)) : undefined;
  }

  private status(taskId: string): CatSessionStatus {
    return {
      busy: this.tasks.isRunning(taskId),
      wheelHeld: this.tasks.isWheelHeld(taskId),
      wheelUnavailable: this.tasks.resumeBlocker(taskId),
    };
  }

  private async call<T>(catId: string, fn: (taskId: string) => Promise<T>): Promise<T> {
    const task = this.taskOf(catId);
    if (!task) throw new CatSessionError(404, 'No session for this cat');
    try {
      return await fn(task.id);
    } catch (err) {
      if (err instanceof TaskBusyError) throw new CatSessionError(409, err.message);
      if (err instanceof TaskInputError) throw new CatSessionError(400, err.message);
      throw err;
    }
  }
}
