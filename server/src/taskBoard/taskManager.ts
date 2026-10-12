/**
 * Task board runtime. Every task targets a created cat or the team: the cat
 * office (server/src/orchestrator/) runs it in its own worktree. A task
 * without a target is rejected. A task is never an office character: the
 * office holds only created cats and guests.
 */

import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import * as path from 'path';

import type { TaskDetail, TaskSummary, TaskTarget } from '../../../core/src/tasks.js';
import { TASK_WORKTREES_DIR, TASKS_FILE_NAME } from '../constants.js';
import { isProcessRunning } from '../server.js';
import { createWorktree, inspectRepo, type RepoInfo, revParse } from './gitWorktree.js';
import { type StoredTask, TaskStore } from './taskStore.js';

const TITLE_MAX_CHARS = 80;

/** What TaskManager.events emits. */
export interface TaskEvents {
  /** A task started, changed or ended. */
  status: [taskId: string];
}

/** Team tasks: the cat office (server/src/orchestrator/) runs a task that has a target. */
export interface TaskFlowRunner {
  targets(): TaskTarget[];
  resolveTarget(target: string): unknown;
  start(task: StoredTask, cwd: string, repo: RepoInfo | null, sink: FlowSink): void;
  /** Go on with an interrupted team task (Resume). */
  resume(task: StoredTask, sink: FlowSink): void;
  /** Cancel a running or interrupted team task. */
  cancel(task: StoredTask, sink: FlowSink): void;
  /** The lead's engine is not ready: what is wrong and how to fix it. */
  preflight(target: string): Promise<string | undefined>;
  /** A run failed: the engine cannot run (logged out when `authFailed`). Returns the message. */
  engineDown(engine: 'claude', authFailed: boolean): string;
  dispose(): void;
}

interface FlowSink {
  save(task: StoredTask): void;
  ended(task: StoredTask): void;
}

export interface TaskManagerOptions {
  /** ~/.pixel-agents (tasks.json and worktrees/ live here). */
  stateDir: string;
  /** Runs the tasks (each targets the team or one cat). */
  flows?: TaskFlowRunner;
}

/** Thrown for a request the caller must fix (HTTP 400). */
export class TaskInputError extends Error {}

/** Thrown when a request clashes with the task's state (HTTP 409). */
export class TaskBusyError extends Error {}

/** Strip server-only bookkeeping. */
function toDetail(task: StoredTask): TaskDetail {
  const {
    ownerPid: _pid,
    repoRoot: _root,
    baseCommit: _base,
    worktreePath: _wt,
    chatId: _chat,
    ...detail
  } = task;
  return detail;
}

/** Strip the heavy fields the board list never shows. */
function toSummary(task: StoredTask): TaskSummary {
  const {
    result: _r,
    changedFiles: _f,
    diff: _d,
    diffTruncated: _t,
    log: _l,
    ...summary
  } = toDetail(task);
  return summary;
}

export class TaskManager {
  private readonly store: TaskStore;
  /** Live team tasks (the orchestrator owns their runs). */
  private readonly flowTasks = new Map<string, StoredTask>();
  readonly events = new EventEmitter<TaskEvents>();

  constructor(private readonly opts: TaskManagerOptions) {
    this.store = new TaskStore(path.join(opts.stateDir, TASKS_FILE_NAME));
    this.markOrphansInterrupted();
  }

  list(): TaskSummary[] {
    return Object.values(this.allTasks())
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(toSummary);
  }

  get(id: string): TaskDetail | undefined {
    const task = this.allTasks()[id];
    return task ? toDetail(task) : undefined;
  }

  targets(): TaskTarget[] {
    return this.opts.flows?.targets() ?? [];
  }

  /** The jobs a CEO desk chat started, newest first. */
  chatJobs(chatId: string): TaskDetail[] {
    return Object.values(this.allTasks())
      .filter((t) => t.chatId === chatId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(toDetail);
  }

  /**
   * Board migration: interrupted team tasks that no chat owns (the old Tasks
   * board started them) join this CEO desk chat, so its dock shows them with
   * Resume and Cancel. Returns their ids, oldest first.
   */
  adoptInterrupted(chatId: string): string[] {
    const orphans = Object.values(this.allTasks())
      .filter((t) => !t.chatId && t.flow?.state === 'interrupted')
      .sort((a, b) => a.createdAt - b.createdAt);
    for (const task of orphans) {
      task.chatId = chatId;
      this.store.save(task);
    }
    return orphans.map((t) => t.id);
  }

  /**
   * `job`: the CEO desk chat that starts the task, and the ref the task branch
   * starts from (a rework starts from the branch of the job it corrects).
   */
  async create(
    prompt: string,
    cwd: string,
    target: string,
    job?: { chatId?: string; baseRef?: string },
  ): Promise<TaskSummary> {
    if (!path.isAbsolute(cwd)) throw new TaskInputError('Folder must be an absolute path');
    const flows = this.opts.flows;
    if (!flows?.resolveTarget(target)) {
      throw new TaskInputError(`Unknown target: ${target}`);
    }
    const id = crypto.randomBytes(4).toString('hex');
    const firstLine = prompt.trim().split('\n')[0].trim();
    const task: StoredTask = {
      id,
      title: firstLine.slice(0, TITLE_MAX_CHARS),
      prompt,
      cwd,
      status: 'running',
      createdAt: Date.now(),
      ownerPid: process.pid,
      log: [],
      ...(job?.chatId ? { chatId: job.chatId } : {}),
    };

    // Nothing spawns while the engine is missing or logged out: the task fails now, with the fix.
    const problem = await flows?.preflight(target);
    if (problem) {
      task.target = target;
      return this.fail(task, problem);
    }

    let agentCwd = cwd;
    const repo = await inspectRepo(cwd);
    if (repo && job?.baseRef) {
      try {
        repo.head = await revParse(repo.root, job.baseRef);
      } catch {
        throw new TaskInputError(`Unknown base branch: ${job.baseRef}`);
      }
    }
    if (repo) {
      task.repoRoot = repo.root;
      task.baseCommit = repo.head;
      task.branch = `task/${id}`;
      task.worktreePath = path.join(this.opts.stateDir, TASK_WORKTREES_DIR, id);
      try {
        await createWorktree(repo, task.worktreePath, task.branch);
      } catch (err) {
        return this.fail(task, `Could not create worktree: ${errorText(err)}`);
      }
      agentCwd = path.join(task.worktreePath, repo.subdir);
    }

    task.target = target;
    this.flowTasks.set(id, task);
    try {
      flows.start(task, agentCwd, repo, this.flowSink());
    } catch (err) {
      this.flowTasks.delete(id);
      return this.fail(task, `Could not start the team: ${errorText(err)}`);
    }
    this.store.save(task);
    return toSummary(task);
  }

  /**
   * Resume a team task the server stopped (T14). Only an interrupted task that
   * no live server owns. Returns the task, or throws TaskBusyError / TaskInputError.
   */
  resume(id: string): TaskSummary {
    const task = this.stoppedFlowTask(id);
    if (task.flow?.state !== 'interrupted') {
      throw new TaskBusyError('Only an interrupted team task can resume.');
    }
    Object.assign(task, { status: 'running', ownerPid: process.pid });
    delete task.error;
    delete task.finishedAt;
    this.flowTasks.set(id, task);
    try {
      this.opts.flows!.resume(task, this.flowSink());
    } catch (err) {
      this.flowTasks.delete(id);
      this.markInterrupted(task);
      throw new TaskBusyError(errorText(err));
    }
    this.store.save(task);
    return toSummary(task);
  }

  /** Cancel a running or interrupted team task (T12, T15): the branches stay. */
  cancel(id: string): TaskSummary {
    const live = this.flowTasks.get(id);
    const task = live ?? this.stoppedFlowTask(id);
    if (!live && task.flow?.state !== 'interrupted') {
      throw new TaskBusyError('Only a running or interrupted team task can be cancelled.');
    }
    task.ownerPid = process.pid;
    this.flowTasks.set(id, task);
    try {
      this.opts.flows!.cancel(task, this.flowSink());
    } catch (err) {
      if (!live) this.flowTasks.delete(id);
      throw new TaskBusyError(errorText(err));
    }
    this.store.save(task);
    return toSummary(task);
  }

  /** A team task of this board that no running server works on. */
  private stoppedFlowTask(id: string): StoredTask {
    const task = this.store.readAll()[id];
    if (!task?.target || !task.flow || !this.opts.flows) {
      throw new TaskInputError('No such team task.');
    }
    if (this.flowTasks.has(id)) throw new TaskBusyError('The task is running.');
    if (task.ownerPid !== process.pid && isProcessRunning(task.ownerPid)) {
      throw new TaskBusyError('Another server runs this task.');
    }
    return task;
  }

  /** Every save of a team task is a status event: the CEO desk updates its job cards. */
  private flowSink(): FlowSink {
    return {
      save: (t) => {
        this.store.save(t);
        this.events.emit('status', t.id);
      },
      ended: (t) => {
        this.flowTasks.delete(t.id);
        this.store.save(t);
        this.events.emit('status', t.id);
      },
    };
  }

  /** Server shutdown: record why every team task this process owns stopped. */
  dispose(): void {
    this.opts.flows?.dispose();
    for (const task of this.flowTasks.values()) this.markInterrupted(task);
    this.flowTasks.clear();
  }

  private allTasks(): Record<string, StoredTask> {
    const tasks = this.store.readAll();
    for (const task of this.flowTasks.values()) tasks[task.id] = task;
    return tasks;
  }

  private fail(task: StoredTask, message: string): TaskSummary {
    task.status = 'error';
    task.error = message;
    task.finishedAt = Date.now();
    this.store.save(task);
    return toSummary(task);
  }

  private markInterrupted(task: StoredTask): void {
    task.status = 'error';
    task.error =
      'Interrupted: the server stopped before the task finished.' +
      (task.worktreePath ? ` Worktree kept at ${task.worktreePath}` : '');
    if (task.flow) task.flow.state = 'interrupted';
    task.finishedAt = Date.now();
    this.store.save(task);
  }

  /** A `running` task whose owning server is gone can never finish. */
  private markOrphansInterrupted(): void {
    for (const task of Object.values(this.store.readAll())) {
      if (task.status !== 'running') continue;
      if (task.ownerPid !== process.pid && isProcessRunning(task.ownerPid)) continue;
      this.markInterrupted(task);
    }
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
