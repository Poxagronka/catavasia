/**
 * Task board runtime: each task is one headless `claude -p` run with no
 * permission prompts, in its own git worktree (or directly in the folder when
 * it is not a git repo). A run is never an office character: the office
 * holds only created cats and guests.
 *
 * Lifecycle: create -> worktree + spawn -> stream-json log -> exit ->
 * commit + diff + worktree remove (branch kept) -> done | error.
 */

import { type ChildProcess, spawn } from 'child_process';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import * as path from 'path';

import type { TaskDetail, TaskSummary, TaskTarget } from '../../../core/src/tasks.js';
import {
  TASK_LOG_MAX_ENTRIES,
  TASK_STDERR_TAIL_CHARS,
  TASK_WORKTREES_DIR,
  TASKS_FILE_NAME,
} from '../constants.js';
import { isAuthError } from '../orchestrator/engineStatus.js';
import { claudeProvider } from '../providers/index.js';
import { isProcessRunning } from '../server.js';
import { officeLimits } from '../usageLimits.js';
import {
  createWorktree,
  finalizeWorktree,
  inspectRepo,
  type RepoInfo,
  revParse,
} from './gitWorktree.js';
import { parseStreamLine, type StreamResult } from './streamJson.js';
import { type StoredTask, TaskStore } from './taskStore.js';

const TITLE_MAX_CHARS = 80;

/** The part of AgentRuntime a task needs: mute the run's session, so it never becomes a guest. */
export interface TaskAgentHost {
  ignoreHeadlessSession(sessionId: string, cwd: string): void;
}

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
  /** The lead's engine (claude for a plain run) is not ready: what is wrong and how to fix it. */
  preflight(target?: string): Promise<string | undefined>;
  /** A run failed: the engine cannot run (logged out when `authFailed`). Returns the message. */
  engineDown(engine: 'claude', authFailed: boolean): string;
  dispose(): void;
}

interface FlowSink {
  save(task: StoredTask): void;
  ended(task: StoredTask): void;
}

export interface TaskManagerOptions {
  host: TaskAgentHost;
  /** ~/.pixel-agents (tasks.json and worktrees/ live here). */
  stateDir: string;
  /** CLI binary override (tests). Default: the provider's launch command. */
  claudeBin?: string;
  /** Runs tasks that target the team or one cat. */
  flows?: TaskFlowRunner;
}

interface RunningTask {
  task: StoredTask;
  child: ChildProcess;
  result?: StreamResult;
  stderr: string;
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
    sessionId: _sid,
    agentCwd: _cwd,
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
  private readonly running = new Map<string, RunningTask>();
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
    target?: string,
    job?: { chatId?: string; baseRef?: string },
  ): Promise<TaskSummary> {
    if (!path.isAbsolute(cwd)) throw new TaskInputError('Folder must be an absolute path');
    const flows = this.opts.flows;
    if (target !== undefined && !flows?.resolveTarget(target)) {
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
      if (target !== undefined) task.target = target;
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

    if (target !== undefined && flows) {
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

    const sessionId = crypto.randomUUID();
    this.opts.host.ignoreHeadlessSession(sessionId, agentCwd);
    task.sessionId = sessionId;
    task.agentCwd = agentCwd;
    this.store.save(task);
    this.spawnRun(task, task.prompt);
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

  /** Server shutdown: stop every run this process owns and record why. */
  dispose(): void {
    for (const run of this.running.values()) {
      run.child.removeAllListeners('close');
      run.child.kill('SIGTERM');
      this.markInterrupted(run.task);
    }
    this.running.clear();
    this.opts.flows?.dispose();
    for (const task of this.flowTasks.values()) this.markInterrupted(task);
    this.flowTasks.clear();
  }

  private allTasks(): Record<string, StoredTask> {
    const tasks = this.store.readAll();
    for (const run of this.running.values()) tasks[run.task.id] = run.task;
    for (const task of this.flowTasks.values()) tasks[task.id] = task;
    return tasks;
  }

  private spawnRun(task: StoredTask, prompt: string): void {
    const cwd = task.agentCwd!;
    const launch = claudeProvider.buildLaunchCommand!(task.sessionId!, cwd, {
      bypassPermissions: true,
    });
    const args = [...launch.args, '-p', '--output-format', 'stream-json', '--verbose'];
    const child = spawn(this.opts.claudeBin ?? launch.command, args, {
      cwd,
      env: { ...process.env, ...launch.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const run: RunningTask = { task, child, stderr: '' };
    this.running.set(task.id, run);
    this.events.emit('status', task.id);

    // The prompt goes through stdin so a prompt starting with '-' is never
    // parsed as a CLI flag.
    child.stdin?.on('error', () => {});
    child.stdin?.end(prompt);

    let pending = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      pending += chunk.toString();
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) this.onStreamLine(run, line);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      run.stderr = (run.stderr + chunk.toString()).slice(-TASK_STDERR_TAIL_CHARS);
    });
    child.on('error', (err) => {
      run.stderr += `\n${err.message}`;
    });
    child.on('close', (code) => {
      if (pending) this.onStreamLine(run, pending);
      void this.finishRun(run, code);
    });
  }

  private onStreamLine(run: RunningTask, line: string): void {
    officeLimits.observe(line);
    const parsed = parseStreamLine(line);
    // "Not logged in" lines: the error row at the end says it once, with the fix.
    parsed.log = parsed.log.filter((e) => e.kind === 'tool' || !isAuthError(e.text));
    if (parsed.result) run.result = parsed.result;
    const log = run.task.log;
    log.push(...parsed.log);
    if (log.length > TASK_LOG_MAX_ENTRIES) log.splice(0, log.length - TASK_LOG_MAX_ENTRIES);
  }

  private async finishRun(run: RunningTask, code: number | null): Promise<void> {
    const { task, result } = run;
    task.result = result?.text;
    task.costUsd = result?.costUsd;
    task.durationMs = result?.durationMs;
    task.numTurns = result?.numTurns;

    const worktreeError = await this.finalize(task);

    const ok = code === 0 && result !== undefined && !result.isError;
    task.status = ok && !worktreeError ? 'done' : 'error';
    if (!ok) {
      task.error = result?.isError
        ? (result.text ?? 'The run reported an error')
        : `Exit code ${code ?? 'none'}: ${run.stderr.trim() || 'no output'}`;
      if (isAuthError(task.error))
        task.error = this.opts.flows?.engineDown('claude', true) ?? task.error;
    }
    if (worktreeError) task.error = task.error ? `${task.error}\n${worktreeError}` : worktreeError;
    task.finishedAt = Date.now();
    this.running.delete(task.id);
    this.store.save(task);
    this.events.emit('status', task.id);
    console.log(`[catavasia] Task ${task.id} ${task.status}`);
  }

  /** Commit the worktree, record the diff and remove it. Returns an error text on failure. */
  private async finalize(task: StoredTask): Promise<string | undefined> {
    if (!task.worktreePath || !task.repoRoot || !task.baseCommit) return undefined;
    try {
      const outcome = await finalizeWorktree(
        task.repoRoot,
        task.worktreePath,
        task.baseCommit,
        `task ${task.id}: ${task.title}`,
      );
      Object.assign(task, outcome);
      return undefined;
    } catch (err) {
      return `Worktree cleanup failed (kept at ${task.worktreePath}): ${errorText(err)}`;
    }
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
