/**
 * Task board runtime: each task is one headless `claude -p` run with no
 * permission prompts, in its own git worktree (or directly in the folder when
 * it is not a git repo), shown in the office as a headless agent.
 *
 * Lifecycle: create -> worktree + agent + spawn -> stream-json log -> exit ->
 * commit + diff + worktree remove (branch kept) -> done | error.
 */

import { type ChildProcess, spawn } from 'child_process';
import * as crypto from 'crypto';
import * as path from 'path';

import type { TaskDetail, TaskSummary } from '../../../core/src/tasks.js';
import {
  TASK_LOG_MAX_ENTRIES,
  TASK_STDERR_TAIL_CHARS,
  TASK_WORKTREES_DIR,
  TASKS_FILE_NAME,
} from '../constants.js';
import { claudeProvider } from '../providers/index.js';
import { isProcessRunning } from '../server.js';
import { createWorktree, finalizeWorktree, inspectRepo } from './gitWorktree.js';
import { parseStreamLine, type StreamResult } from './streamJson.js';
import { type StoredTask, TaskStore } from './taskStore.js';

const TITLE_MAX_CHARS = 80;

/** The part of AgentRuntime a task needs: one character per run. */
export interface TaskAgentHost {
  launchHeadlessAgent(
    sessionId: string,
    cwd: string,
  ): { id: number; palette?: number; hueShift?: number };
  /** The run ended: the character stays as an idle cat linked to the task. */
  finishHeadlessAgent(id: number, taskId: string): void;
}

export interface TaskManagerOptions {
  host: TaskAgentHost;
  /** ~/.pixel-agents (tasks.json and worktrees/ live here). */
  stateDir: string;
  /** Folder the server was started in: the default task target. */
  defaultCwd: string;
  /** CLI binary override (tests). Default: the provider's launch command. */
  claudeBin?: string;
}

interface RunningTask {
  task: StoredTask;
  child: ChildProcess;
  result?: StreamResult;
  stderr: string;
}

/** Thrown for a request the caller must fix (HTTP 400). */
export class TaskInputError extends Error {}

/** Strip server-only bookkeeping. */
function toDetail(task: StoredTask): TaskDetail {
  const { ownerPid: _pid, repoRoot: _root, baseCommit: _base, worktreePath: _wt, ...detail } = task;
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

  constructor(private readonly opts: TaskManagerOptions) {
    this.store = new TaskStore(path.join(opts.stateDir, TASKS_FILE_NAME));
    this.markOrphansInterrupted();
  }

  get defaultCwd(): string {
    return this.opts.defaultCwd;
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

  async create(prompt: string, cwd: string = this.opts.defaultCwd): Promise<TaskSummary> {
    if (!path.isAbsolute(cwd)) throw new TaskInputError('Folder must be an absolute path');
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
    };

    let agentCwd = cwd;
    const repo = await inspectRepo(cwd);
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

    const sessionId = crypto.randomUUID();
    const agent = this.opts.host.launchHeadlessAgent(sessionId, agentCwd);
    task.agentId = agent.id;
    task.palette = agent.palette;
    task.hueShift = agent.hueShift;
    this.store.save(task);
    this.spawnRun(task, sessionId, agentCwd);
    return toSummary(task);
  }

  /** Server shutdown: stop every run this process owns and record why. */
  dispose(): void {
    for (const run of this.running.values()) {
      run.child.removeAllListeners('close');
      run.child.kill('SIGTERM');
      this.markInterrupted(run.task);
    }
    this.running.clear();
  }

  private allTasks(): Record<string, StoredTask> {
    const tasks = this.store.readAll();
    for (const run of this.running.values()) tasks[run.task.id] = run.task;
    return tasks;
  }

  private spawnRun(task: StoredTask, sessionId: string, cwd: string): void {
    const launch = claudeProvider.buildLaunchCommand!(sessionId, cwd, { bypassPermissions: true });
    const args = [...launch.args, '-p', '--output-format', 'stream-json', '--verbose'];
    const child = spawn(this.opts.claudeBin ?? launch.command, args, {
      cwd,
      env: { ...process.env, ...launch.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const run: RunningTask = { task, child, stderr: '' };
    this.running.set(task.id, run);

    // The prompt goes through stdin so a prompt starting with '-' is never
    // parsed as a CLI flag.
    child.stdin?.on('error', () => {});
    child.stdin?.end(task.prompt);

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
    const parsed = parseStreamLine(line);
    if (parsed.result) run.result = parsed.result;
    const log = run.task.log;
    log.push(...parsed.log);
    if (log.length > TASK_LOG_MAX_ENTRIES) log.splice(0, log.length - TASK_LOG_MAX_ENTRIES);
  }

  private async finishRun(run: RunningTask, code: number | null): Promise<void> {
    const { task, result } = run;
    if (task.agentId !== undefined) this.opts.host.finishHeadlessAgent(task.agentId, task.id);
    task.result = result?.text;
    task.costUsd = result?.costUsd;
    task.durationMs = result?.durationMs;
    task.numTurns = result?.numTurns;

    let worktreeError: string | undefined;
    if (task.worktreePath && task.repoRoot && task.baseCommit) {
      try {
        const outcome = await finalizeWorktree(
          task.repoRoot,
          task.worktreePath,
          task.baseCommit,
          `task ${task.id}: ${task.title}`,
        );
        Object.assign(task, outcome);
      } catch (err) {
        worktreeError = `Worktree cleanup failed (kept at ${task.worktreePath}): ${errorText(err)}`;
      }
    }

    const ok = code === 0 && result !== undefined && !result.isError;
    task.status = ok && !worktreeError ? 'done' : 'error';
    if (!ok) {
      task.error = result?.isError
        ? (result.text ?? 'The run reported an error')
        : `Exit code ${code ?? 'none'}: ${run.stderr.trim() || 'no output'}`;
    }
    if (worktreeError) task.error = task.error ? `${task.error}\n${worktreeError}` : worktreeError;
    task.finishedAt = Date.now();
    this.running.delete(task.id);
    this.store.save(task);
    console.log(`[Pixel Agents] Task ${task.id} ${task.status}`);
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
