/**
 * The interpreter of one team task (task-state-machine.md §8): it logs each
 * event, reduces it, runs the effects with the real helpers (scheduler,
 * session locks, engine adapter, git), and feeds their results back as events.
 * One queue per task: events of one task never interleave.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import type { CatMessageKind, CatProfile, ServerMessage } from '../../../../core/src/messages.js';
import type { NarratorInput } from '../../../../core/src/narrator.js';
import type { TaskLogEntry } from '../../../../core/src/tasks.js';
import { acquireSessionLock, sessionLockHolder } from '../../catTerminal/sessionLocks.js';
import { ORCHESTRATOR_DIR, SESSION_LOCK_RETRY_MS } from '../../constants.js';
import { commitAll } from '../../taskBoard/gitWorktree.js';
import type { StoredTask } from '../../taskBoard/taskStore.js';
import type { CatConsoles } from '../catConsoles.js';
import type { CatResidents } from '../catResidents.js';
import type { EngineAdapter, TurnHandle } from '../engineAdapter.js';
import type { TurnScheduler } from '../turnScheduler.js';
import type { EventLog } from './eventLog.js';
import { isActive, isTerminal, wireFlow } from './helpers.js';
import { checkInvariants } from './invariants.js';
import { reduce, startTask } from './taskReducer.js';
import { appendTaskLog, spawnTurn } from './turnProcess.js';
import type { Effect, TaskEvent, TaskState, ToolReply } from './types.js';
import { endFlowWorkspaces, mergeReports, prepareWorkspace } from './workspace.js';

/** Where a task is persisted (the task board). */
export interface FlowSink {
  save(task: StoredTask): void;
  ended(task: StoredTask): void;
}

/** What the office (Orchestrator) lends a task runner. */
export interface RunnerHost {
  readonly stateDir: string;
  readonly scheduler: TurnScheduler;
  readonly residents: CatResidents;
  readonly consoles: CatConsoles;
  mcpUrl(): string;
  adapterFor(cat: CatProfile): EngineAdapter | undefined;
  /** The persona file text of a cat (context-policy.md §6) and its prompt commit. */
  persona(cat: CatProfile): { text: string; sha?: string };
  emit(message: ServerMessage): void;
  narrate?(input: NarratorInput): void;
  /** A cat's MCP token now belongs to this runner (undefined: drop it). */
  setToken(token: string, owner: { runner: TaskRunner; catId: string } | undefined): void;
  /** The task left the machine. */
  finished(runner: TaskRunner): void;
  /** The Cat CEO queue (cat-ceo-judge.md): review this finished task. */
  requestReview?(task: StoredTask, state: TaskState, sink: FlowSink): void;
}

/** Events after which the snapshot is written (§9). */
const SNAPSHOT_AFTER = new Set<TaskEvent['type']>([
  'TaskStarted',
  'TurnFinished',
  'ServerRestarted',
]);
const LOG_ONLY = new Set<TaskEvent['type']>(['ToolActivity', 'CompactHappened']);

export class TaskRunner {
  private readonly handles = new Map<string, TurnHandle>();
  /** Granted scheduler jobs, released by ReleaseTurn (with the session lock). */
  private readonly slots = new Map<string, () => void>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly gitWork = new Set<Promise<void>>();
  private readonly tokens = new Map<string, string>();
  private readonly queue: TaskEvent[] = [];
  private draining = false;
  private disposed = false;

  constructor(
    private readonly host: RunnerHost,
    readonly task: StoredTask,
    private readonly sink: FlowSink,
    private readonly log: EventLog,
    public state: TaskState,
    private seq: number,
  ) {}

  /** T1: a new task from its TaskStarted event. */
  static start(
    host: RunnerHost,
    task: StoredTask,
    sink: FlowSink,
    log: EventLog,
    event: Extract<TaskEvent, { type: 'TaskStarted' }>,
  ): TaskRunner {
    const runner = new TaskRunner(host, task, sink, log, startTask(event).state, 0);
    runner.dispatch(event);
    return runner;
  }

  /** Append, reduce, run the effects. Returns the reply of a ToolCalled event. */
  dispatch(event: TaskEvent): ToolReply | undefined {
    if (this.disposed) return undefined;
    if (this.draining) {
      this.queue.push(event);
      return undefined;
    }
    this.draining = true;
    try {
      const reply = this.step(event);
      while (this.queue.length && !this.disposed) this.step(this.queue.shift()!);
      return reply;
    } finally {
      this.draining = false;
    }
  }

  /** Server shutdown: T13, then stop. The log keeps the state for Resume. */
  interrupt(): void {
    this.dispatch({ type: 'ServerRestarted' });
    this.stop();
  }

  private step(event: TaskEvent): ToolReply | undefined {
    this.log.append({ seq: ++this.seq, at: Date.now(), event });
    let step;
    try {
      step = event.type === 'TaskStarted' ? startTask(event) : reduce(this.state, event);
    } catch (err) {
      console.error(`[catavasia] Team task ${this.task.id}: ${String(err)}`);
      if (event.type !== 'OfficeFailed')
        this.queue.push({ type: 'OfficeFailed', error: String(err) });
      return { text: 'The office failed on this call.', isError: true };
    }
    this.state = step.state;
    const problems = checkInvariants(this.state);
    if (problems.length && isActive(this.state.phase)) {
      console.error(`[catavasia] Team task ${this.task.id}: ${problems.join('; ')}`);
      this.queue.push({ type: 'OfficeFailed', error: problems.join('; ') });
    }
    this.task.flow = wireFlow(this.state);
    if (this.state.costUsd > 0) this.task.costUsd = this.state.costUsd;
    const phase = this.state.phase;
    if (SNAPSHOT_AFTER.has(event.type) || isTerminal(phase) || phase === 'interrupted') {
      this.log.writeSnapshot(this.seq, this.state);
    }
    for (const effect of step.effects) this.run(effect);
    if (!LOG_ONLY.has(event.type) && !this.disposed) this.sink.save(this.task);
    return step.reply;
  }

  private run(fx: Effect): void {
    switch (fx.type) {
      case 'JoinMember':
        return this.join(fx.catId, fx.sessionId);
      case 'RequestTurn':
        return this.requestTurn(fx.catId);
      case 'ReleaseTurn':
        this.slots.get(fx.catId)?.();
        this.slots.delete(fx.catId);
        return;
      case 'PrepareWorkspace':
        return this.track(async () =>
          prepareWorkspace(this.host.stateDir, this.task, this.state.repo, fx.catId).catch(
            (err: unknown) => ({ type: 'WorkspaceFailed', catId: fx.catId, error: errorText(err) }),
          ),
        );
      case 'MergeBranches':
        return this.track(() => mergeReports(this.cat(fx.catId), fx.worktreePath, fx.branches));
      case 'CommitWorktree':
        return this.track(() =>
          commitAll(fx.worktreePath, fx.message).then(
            () => ({ type: 'CommitFinished', assignmentId: fx.assignmentId, ok: true }),
            (err: unknown) => ({
              type: 'CommitFinished',
              assignmentId: fx.assignmentId,
              ok: false,
              error: errorText(err),
            }),
          ),
        );
      case 'SpawnTurn':
        return spawnTurn(
          {
            host: this.host,
            task: this.task,
            rootId: this.state.rootId,
            personaFile: this.personaFile(fx.catId),
            mcpConfigFile: this.mcpFile(fx.catId),
            handles: this.handles,
            dispatch: (event) => this.dispatch(event),
          },
          this.cat(fx.catId),
          fx,
        );
      case 'KillTurn':
        this.handles.get(fx.catId)?.kill();
        return;
      case 'StartTimer': {
        clearTimeout(this.timers.get(fx.id));
        const timer = setTimeout(() => {
          this.timers.delete(fx.id);
          this.dispatch({ type: 'TimerFired', id: fx.id });
        }, fx.ms);
        timer.unref();
        this.timers.set(fx.id, timer);
        return;
      }
      case 'CancelTimer':
        clearTimeout(this.timers.get(fx.id));
        this.timers.delete(fx.id);
        return;
      case 'Emit':
        return this.host.emit(fx.message);
      case 'Message':
        return this.message(fx.from, fx.to, fx.kind, fx.text);
      case 'Log':
        return this.addLog(fx.entry);
      case 'FinalizeWorkspaces':
        void this.finalize();
        return;
      case 'EndTask':
        return this.end();
      case 'RequestReview':
        // EndTask ran first: the review lives outside this runner (it is disposed).
        return this.host.requestReview?.(this.task, this.state, this.sink);
    }
  }

  private cat(catId: string): CatProfile {
    return this.state.cats.find((c) => c.id === catId)!;
  }

  /** Run git work whose result is an event; finalize waits for it. */
  private track(work: () => Promise<TaskEvent>): void {
    const done = work().then((event) => {
      this.dispatch(event);
    });
    this.gitWork.add(done);
    void done.finally(() => this.gitWork.delete(done));
  }

  /** A new MCP token, persona and MCP config files; the session id is kept on a re-join. */
  private join(catId: string, keepSession?: string): void {
    const cat = this.cat(catId);
    const adapter = this.host.adapterFor(cat);
    if (!adapter) {
      this.queue.push({ type: 'OfficeFailed', error: `Engine ${cat.engine} has no adapter` });
      return;
    }
    const dir = path.join(this.host.stateDir, ORCHESTRATOR_DIR, this.task.id);
    fs.mkdirSync(dir, { recursive: true });
    const old = this.tokens.get(catId);
    if (old) this.host.setToken(old, undefined);
    const token = crypto.randomBytes(24).toString('hex');
    this.tokens.set(catId, token);
    this.host.setToken(token, { runner: this, catId });
    const persona = this.host.persona(cat);
    fs.writeFileSync(this.personaFile(catId), persona.text, { mode: 0o600 });
    const mcp = adapter.mcpConfig({ url: this.host.mcpUrl(), token });
    fs.writeFileSync(this.mcpFile(catId), mcp, { mode: 0o600 });
    this.dispatch({
      type: 'MemberJoined',
      catId,
      sessionId: keepSession ?? crypto.randomUUID(),
      ...(persona.sha ? { promptSha: persona.sha } : {}),
    });
  }

  private personaFile(catId: string): string {
    return path.join(this.host.stateDir, ORCHESTRATOR_DIR, this.task.id, `${catId}.md`);
  }

  private mcpFile(catId: string): string {
    return path.join(this.host.stateDir, ORCHESTRATOR_DIR, this.task.id, `${catId}.mcp.json`);
  }

  /** RequestTurn: a scheduler slot, then the session lock (the wheel may hold it). */
  private requestTurn(catId: string): void {
    void this.host.scheduler.run(
      catId,
      () =>
        new Promise<void>((resolve) => {
          if (this.disposed) return resolve();
          const sessionId = this.state.members[catId]?.sessionId;
          const unlock = sessionId ? acquireSessionLock(sessionId, 'turn') : () => {};
          if (!unlock) {
            resolve();
            this.dispatch({ type: 'TurnLockBusy', catId });
            return;
          }
          this.slots.set(catId, () => {
            unlock();
            resolve();
          });
          this.dispatch({ type: 'TurnGranted', catId, turnId: crypto.randomUUID() });
        }),
    );
  }

  /** One office message: the game, the task log, and the narrator (sender's character). */
  private message(from: string, to: string, kind: CatMessageKind, text: string): void {
    this.host.emit({ type: 'catMessage', taskId: this.task.id, from, to, kind, text });
    this.addLog({ kind: 'message', name: `${from} -> ${to} (${kind})`, text });
    const sender = this.state.members[from]?.agentId;
    if (sender === undefined) return;
    const name = (catId: string) => this.state.cats.find((c) => c.id === catId)?.name ?? catId;
    this.host.narrate?.({
      catId: sender,
      ts: Date.now(),
      kind: kind === 'final' ? 'result' : 'message',
      from: name(from),
      to: name(to),
      text,
    });
  }

  private addLog(entry: TaskLogEntry): void {
    appendTaskLog(this.task, entry);
  }

  /** Wait for the killed turns and the git work, then clean the workspaces up. */
  private async finalize(): Promise<void> {
    await Promise.all([...this.handles.values()].map((h) => h.done));
    while (this.gitWork.size) await Promise.all([...this.gitWork]);
    // A shutdown meanwhile: the task is interrupted, Resume finalizes again.
    if (this.disposed) return;
    // The user drives a cat's session in a terminal (its worktree): wait for it.
    const members = () => Object.values(this.state.members);
    while (members().some((m) => m.sessionId && sessionLockHolder(m.sessionId) === 'wheel')) {
      await new Promise((r) => setTimeout(r, SESSION_LOCK_RETRY_MS));
    }
    if (this.disposed) return;
    const error = await endFlowWorkspaces(this.task, this.state);
    // Persona and MCP config files: the tokens in them die with the task.
    fs.rmSync(path.join(this.host.stateDir, ORCHESTRATOR_DIR, this.task.id), {
      recursive: true,
      force: true,
    });
    this.dispatch({ type: 'FinalizeFinished', ...(error ? { error } : {}) });
  }

  private end(): void {
    const { task, state } = this;
    task.status = state.phase === 'done' ? 'done' : 'error';
    task.result = state.result;
    task.error = state.error;
    task.numTurns = state.turns;
    task.finishedAt = Date.now();
    // The cats stay in the office (residents); clicking one opens this task.
    for (const m of Object.values(state.members)) {
      if (m.agentId !== undefined) this.host.residents.linkTask(m.catId, task.id);
    }
    this.stop();
    this.host.finished(this);
    this.sink.ended(task);
    console.log(`[catavasia] Team task ${task.id} ${state.phase}`);
  }

  /** No more events: timers, tokens and held slots go. */
  private stop(): void {
    this.disposed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    for (const token of this.tokens.values()) this.host.setToken(token, undefined);
    this.tokens.clear();
    for (const release of this.slots.values()) release();
    this.slots.clear();
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
