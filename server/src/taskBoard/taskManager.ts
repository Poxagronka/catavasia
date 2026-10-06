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
import { EventEmitter } from 'events';
import * as path from 'path';

import type { NarratorInput } from '../../../core/src/narrator.js';
import type { TaskDetail, TaskLogEntry, TaskSummary, TaskTarget } from '../../../core/src/tasks.js';
import { acquireSessionLock } from '../catTerminal/sessionLocks.js';
import {
  TASK_LOG_MAX_ENTRIES,
  TASK_STDERR_TAIL_CHARS,
  TASK_WORKTREES_DIR,
  TASKS_FILE_NAME,
} from '../constants.js';
import { taskLogInput } from '../narrator/narrator.js';
import { claudeProvider } from '../providers/index.js';
import { isProcessRunning } from '../server.js';
import {
  createWorktree,
  finalizeWorktree,
  inspectRepo,
  reopenWorktree,
  type RepoInfo,
} from './gitWorktree.js';
import { type ParsedStreamLine, parseStreamLine, type StreamResult } from './streamJson.js';
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
  /** A follow-up turn or the wheel works on the session again. */
  resumeHeadlessAgent(id: number): void;
}

/** What TaskManager.events emits, for the cat console (catTerminal/). */
export interface TaskEvents {
  /** New activity-log rows of a task. */
  log: [taskId: string, entries: TaskLogEntry[]];
  /** A task started or ended a turn, or the wheel was taken or released. */
  status: [taskId: string];
}

/** Team tasks: the cat office (server/src/orchestrator/) runs a task that has a target. */
export interface TaskFlowRunner {
  targets(): TaskTarget[];
  resolveTarget(target: string): unknown;
  start(
    task: StoredTask,
    cwd: string,
    repo: RepoInfo | null,
    sink: { save(task: StoredTask): void; ended(task: StoredTask): void },
  ): void;
  dispose(): void;
}

export interface TaskManagerOptions {
  host: TaskAgentHost;
  /** ~/.pixel-agents (tasks.json and worktrees/ live here). */
  stateDir: string;
  /** Folder the server was started in: the default task target. */
  defaultCwd: string;
  /** CLI binary override (tests). Default: the provider's launch command. */
  claudeBin?: string;
  /** Runs tasks that target the team or one cat. */
  flows?: TaskFlowRunner;
  /** Receives the run's events as narrator input (English status lines). */
  narrate?: (input: NarratorInput) => void;
}

interface RunningTask {
  task: StoredTask;
  child: ChildProcess;
  result?: StreamResult;
  stderr: string;
  releaseLock: () => void;
}

/** Thrown for a request the caller must fix (HTTP 400). */
export class TaskInputError extends Error {}

/** Thrown when the session is in use: a turn runs or the wheel is held (HTTP 409). */
export class TaskBusyError extends Error {}

/** Where a resumed session runs, for the wheel's PTY. */
export interface TaskSessionHandle {
  sessionId: string;
  cwd: string;
}

/** Strip server-only bookkeeping. */
function toDetail(task: StoredTask): TaskDetail {
  const {
    ownerPid: _pid,
    repoRoot: _root,
    baseCommit: _base,
    worktreePath: _wt,
    sessionId: _sid,
    agentCwd: _cwd,
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
  /** Release functions of held wheels, by task id. */
  private readonly wheels = new Map<string, () => void>();
  readonly events = new EventEmitter<TaskEvents>();

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

  targets(): TaskTarget[] {
    return this.opts.flows?.targets() ?? [];
  }

  async create(
    prompt: string,
    cwd: string = this.opts.defaultCwd,
    target?: string,
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

    if (target !== undefined && flows) {
      task.target = target;
      this.flowTasks.set(id, task);
      try {
        flows.start(task, agentCwd, repo, {
          save: (t) => this.store.save(t),
          ended: (t) => {
            this.flowTasks.delete(t.id);
            this.store.save(t);
          },
        });
      } catch (err) {
        this.flowTasks.delete(id);
        return this.fail(task, `Could not start the team: ${errorText(err)}`);
      }
      this.store.save(task);
      return toSummary(task);
    }

    const sessionId = crypto.randomUUID();
    // A fresh uuid is always free; the lock only makes the turn visible to the wheel.
    const releaseLock = acquireSessionLock(sessionId, 'turn')!;
    const agent = this.opts.host.launchHeadlessAgent(sessionId, agentCwd);
    task.agentId = agent.id;
    task.palette = agent.palette;
    task.hueShift = agent.hueShift;
    task.sessionId = sessionId;
    task.agentCwd = agentCwd;
    this.store.save(task);
    this.spawnRun(task, task.prompt, false, releaseLock);
    return toSummary(task);
  }

  /** The newest task whose office character is `agentId`. Only tasks this
   *  process owns: agent ids start at 1 again after a restart. */
  findByAgent(agentId: number): TaskDetail | undefined {
    const tasks = Object.values(this.allTasks()).filter(
      (t) => t.agentId === agentId && t.ownerPid === process.pid,
    );
    const task = tasks.sort((a, b) => b.createdAt - a.createdAt)[0];
    return task ? toDetail(task) : undefined;
  }

  isRunning(id: string): boolean {
    return this.running.has(id);
  }

  isWheelHeld(id: string): boolean {
    return this.wheels.has(id);
  }

  /** Why the task's session cannot be resumed at all, or undefined when it can. */
  resumeBlocker(id: string): string | undefined {
    const task = this.allTasks()[id];
    if (!task) return 'No such task';
    if (!task.sessionId || !task.agentCwd) return 'This task was created before sessions were kept';
    if (task.ownerPid !== process.pid && isProcessRunning(task.ownerPid)) {
      return 'Another catavasia server owns this task';
    }
    return undefined;
  }

  /** Send the cat a message: one more headless turn on the same session. */
  async followUp(id: string, text: string): Promise<void> {
    const { stored, release } = await this.claimSession(id, 'turn');
    const entry: TaskLogEntry = { kind: 'user', text };
    stored.log.push(entry);
    this.events.emit('log', id, [entry]);
    try {
      this.spawnRun(stored, text, true, release);
    } catch (err) {
      this.running.delete(id);
      release();
      this.fail(stored, `Could not start claude: ${errorText(err)}`);
      this.events.emit('status', id);
      throw err;
    }
  }

  /** Lock the session for an interactive PTY and return where to run it. */
  async beginWheel(id: string): Promise<TaskSessionHandle> {
    const { stored, release } = await this.claimSession(id, 'wheel');
    this.wheels.set(id, release);
    this.events.emit('status', id);
    return { sessionId: stored.sessionId!, cwd: stored.agentCwd! };
  }

  /** The PTY ended: commit what the user did and free the session. */
  async endWheel(id: string): Promise<void> {
    const release = this.wheels.get(id);
    if (!release) return;
    const task = this.allTasks()[id];
    if (task.agentId !== undefined) this.opts.host.finishHeadlessAgent(task.agentId, id);
    const worktreeError = await this.finalize(task);
    if (worktreeError) task.error = worktreeError;
    this.store.save(task);
    this.wheels.delete(id);
    release();
    this.events.emit('status', id);
  }

  /** Take the session lock, check the worktree out again and wake the cat. */
  private async claimSession(
    id: string,
    holder: 'turn' | 'wheel',
  ): Promise<{ stored: StoredTask; release: () => void }> {
    const blocker = this.resumeBlocker(id);
    if (blocker) throw new TaskInputError(blocker);
    const stored = this.allTasks()[id];
    if (this.running.has(id) || this.wheels.has(id)) {
      throw new TaskBusyError('The cat is busy with its session');
    }
    const release = acquireSessionLock(stored.sessionId!, holder);
    if (!release) throw new TaskBusyError('The session is in use');
    try {
      if (stored.worktreePath && stored.repoRoot && stored.branch) {
        await reopenWorktree(stored.repoRoot, stored.worktreePath, stored.branch);
      }
    } catch (err) {
      release();
      throw new TaskInputError(`Could not reopen the worktree: ${errorText(err)}`);
    }
    stored.ownerPid = process.pid;
    if (holder === 'turn') {
      stored.status = 'running';
      stored.error = undefined;
      stored.finishedAt = undefined;
    }
    if (stored.agentId !== undefined) this.opts.host.resumeHeadlessAgent(stored.agentId);
    this.store.save(stored);
    return { stored, release };
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

  private spawnRun(
    task: StoredTask,
    prompt: string,
    resume: boolean,
    releaseLock: () => void,
  ): void {
    const cwd = task.agentCwd!;
    const launch = claudeProvider.buildLaunchCommand!(task.sessionId!, cwd, {
      bypassPermissions: true,
    });
    // A follow-up continues the same session: `--resume <id>` in place of `--session-id <id>`.
    const launchArgs = resume
      ? launch.args.map((a) => (a === '--session-id' ? '--resume' : a))
      : launch.args;
    const args = [...launchArgs, '-p', '--output-format', 'stream-json', '--verbose'];
    const child = spawn(this.opts.claudeBin ?? launch.command, args, {
      cwd,
      env: { ...process.env, ...launch.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const run: RunningTask = { task, child, stderr: '', releaseLock };
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
    const parsed = parseStreamLine(line);
    if (parsed.result) run.result = parsed.result;
    this.narrateLine(run.task.agentId, parsed);
    const log = run.task.log;
    log.push(...parsed.log);
    if (log.length > TASK_LOG_MAX_ENTRIES) log.splice(0, log.length - TASK_LOG_MAX_ENTRIES);
    if (parsed.log.length > 0) this.events.emit('log', run.task.id, parsed.log);
  }

  private narrateLine(catId: number | undefined, parsed: ParsedStreamLine): void {
    const narrate = this.opts.narrate;
    if (!narrate || catId === undefined) return;
    const ts = Date.now();
    for (const entry of parsed.log) narrate(taskLogInput(catId, entry, ts));
    if (parsed.result?.isError) narrate({ catId, ts, kind: 'state', text: 'error' });
    else if (parsed.result) narrate({ catId, ts, kind: 'result', text: parsed.result.text });
  }

  private async finishRun(run: RunningTask, code: number | null): Promise<void> {
    const { task, result } = run;
    if (task.agentId !== undefined) this.opts.host.finishHeadlessAgent(task.agentId, task.id);
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
    }
    if (worktreeError) task.error = task.error ? `${task.error}\n${worktreeError}` : worktreeError;
    task.finishedAt = Date.now();
    this.running.delete(task.id);
    this.store.save(task);
    run.releaseLock();
    // The error row is not in the log; the console shows it once, here.
    if (task.status === 'error' && task.error) {
      this.events.emit('log', task.id, [{ kind: 'error', text: task.error }]);
    }
    this.events.emit('status', task.id);
    console.log(`[Pixel Agents] Task ${task.id} ${task.status}`);
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
