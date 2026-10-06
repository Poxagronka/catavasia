/**
 * ~/.pixel-agents/tasks.json persistence for the task board.
 *
 * Several standalone servers can run at once and share this file, so every
 * write is a read-merge-write of ONE task (atomic tmp + rename), and a task is
 * only ever written by the server process that owns it (`ownerPid`).
 */

import * as fs from 'fs';
import * as path from 'path';

import type { TaskDetail } from '../../../core/src/tasks.js';

/** A task as persisted: the wire detail plus server-only bookkeeping. */
export interface StoredTask extends TaskDetail {
  /** PID of the server that runs (or ran) this task. */
  ownerPid: number;
  repoRoot?: string;
  baseCommit?: string;
  worktreePath?: string;
  /** Claude session id of the run: follow-up turns and the wheel resume it. */
  sessionId?: string;
  /** Folder the session runs in (inside the worktree when there is one). */
  agentCwd?: string;
  /** The CEO desk chat that started this task as a job. */
  chatId?: string;
}

interface TasksFile {
  version: 1;
  tasks: Record<string, StoredTask>;
}

export class TaskStore {
  constructor(private readonly filePath: string) {}

  readAll(): Record<string, StoredTask> {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Partial<TasksFile>;
      return parsed.tasks && typeof parsed.tasks === 'object' ? parsed.tasks : {};
    } catch {
      return {};
    }
  }

  save(task: StoredTask): void {
    const tasks = this.readAll();
    tasks[task.id] = task;
    const data: TasksFile = { version: 1, tasks };
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      console.error(`[catavasia] Tasks: failed to write ${this.filePath}: ${err}`);
    }
  }
}
