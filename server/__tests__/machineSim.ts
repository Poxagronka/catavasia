/**
 * A synchronous driver for the task reducer: it resolves effects the way the
 * interpreter would (instantly, in order), records what the game would see,
 * and checks the invariants after every event. Turns stay running until the
 * test ends them with `finish`, so a test scripts each cat's turn.
 */

import { expect } from 'vitest';

import type { CatProfile, ServerMessage } from '../../core/src/messages.js';
import { checkInvariants } from '../src/orchestrator/machine/invariants.js';
import { reduce, startTask } from '../src/orchestrator/machine/taskReducer.js';
import type {
  Effect,
  TaskEvent,
  TaskState,
  ToolReply,
  TurnResult,
} from '../src/orchestrator/machine/types.js';

export const cat = (id: string, parentId: string | null): CatProfile => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  role: parentId ? 'Developer' : 'Team lead',
  systemPrompt: '',
  engine: 'claude',
  model: 'sonnet',
  effort: 'medium',
  appearance: {},
  parentId,
});

/** boss -> mid -> deep, boss -> w1 */
export const TEAM = [cat('boss', null), cat('mid', 'boss'), cat('w1', 'boss'), cat('deep', 'mid')];

export interface SimOptions {
  cats?: CatProfile[];
  repo?: boolean;
  catCeo?: boolean;
  /** Effects the sim leaves unresolved (the test resolves them). */
  manual?: Array<Effect['type']>;
}

export class Sim {
  state: TaskState;
  readonly effects: Effect[] = [];
  readonly emitted: ServerMessage[] = [];
  readonly messages: Array<{ from: string; to: string; kind: string; text: string }> = [];
  /** Unresolved effects of the types in `manual`. */
  readonly held: Effect[] = [];
  readonly timers = new Map<string, number>();
  readonly spawned: Array<Extract<Effect, { type: 'SpawnTurn' }>> = [];
  /** Cats whose session lock the user holds (RequestTurn -> TurnLockBusy). */
  readonly lockBusy = new Set<string>();
  ended = false;
  private queue: TaskEvent[] = [];
  private seq = 0;

  constructor(private readonly opts: SimOptions = {}) {
    const cats = opts.cats ?? TEAM;
    const step = startTask({
      type: 'TaskStarted',
      taskId: 't1',
      rootId: cats[0].id,
      prompt: 'do it',
      cats,
      runnable: cats.map((c) => c.id),
      repo: opts.repo ? { root: '/repo', head: 'abc', subdir: '' } : null,
      catCeo: opts.catCeo ?? false,
      cwd: '/task',
      ...(opts.repo ? { worktreePath: '/task', branch: 'task/t1' } : {}),
    });
    this.state = step.state;
    this.take(step.effects);
    this.settle();
  }

  /** Reduce one event (and everything it causes); returns the tool reply. */
  send(event: TaskEvent): ToolReply | undefined {
    const step = reduce(this.state, event);
    expect(checkInvariants(step.state), `${event.type}`).toEqual([]);
    this.state = step.state;
    this.take(step.effects);
    this.settle();
    return step.reply;
  }

  tool(catId: string, name: string, args: Record<string, unknown> = {}): ToolReply {
    return this.send({ type: 'ToolCalled', catId, name, args })!;
  }

  /** End the running turn of a cat. */
  finish(catId: string, result: Partial<TurnResult> = {}): void {
    const turnId = this.state.members[catId].turnId;
    expect(this.state.members[catId].turn, `${catId} runs`).toBe('running');
    this.send({
      type: 'TurnFinished',
      catId,
      turnId: turnId!,
      result: { ok: true, text: 'ok', sessionStarted: true, ...result },
    });
  }

  fire(id: string): void {
    expect(this.timers.has(id), `timer ${id}`).toBe(true);
    this.timers.delete(id);
    this.send({ type: 'TimerFired', id });
  }

  running(): string[] {
    return Object.values(this.state.members)
      .filter((m) => m.turn === 'running')
      .map((m) => m.catId);
  }

  /** The text of the running turn's message. */
  lastMessage(catId: string): string {
    return [...this.spawned].reverse().find((s) => s.catId === catId)!.message;
  }

  flowStates(): string[] {
    return this.emitted.flatMap((m) => (m.type === 'flowStateChanged' ? [m.state] : []));
  }

  private take(effects: Effect[]): void {
    for (const fx of effects) {
      this.effects.push(fx);
      if (this.opts.manual?.includes(fx.type)) this.held.push(fx);
      else this.resolve(fx);
    }
  }

  /** Feed queued result events one by one (each may cause more). */
  private settle(): void {
    while (this.queue.length) {
      const event = this.queue.shift()!;
      const step = reduce(this.state, event);
      expect(checkInvariants(step.state), `${event.type}`).toEqual([]);
      this.state = step.state;
      this.take(step.effects);
    }
  }

  private resolve(fx: Effect): void {
    const n = ++this.seq;
    switch (fx.type) {
      case 'JoinMember':
        this.queue.push({
          type: 'MemberJoined',
          catId: fx.catId,
          sessionId: fx.sessionId ?? `s-${fx.catId}-${n}`,
          promptSha: `sha-${fx.catId}`,
        });
        return;
      case 'RequestTurn':
        this.queue.push(
          this.lockBusy.has(fx.catId)
            ? { type: 'TurnLockBusy', catId: fx.catId }
            : { type: 'TurnGranted', catId: fx.catId, turnId: `t${n}` },
        );
        return;
      case 'PrepareWorkspace':
        this.queue.push(
          this.opts.repo
            ? {
                type: 'WorkspaceReady',
                catId: fx.catId,
                cwd: `/wt/${fx.catId}`,
                worktreePath: `/wt/${fx.catId}`,
                branch: `task/t1-${fx.catId}`,
              }
            : { type: 'WorkspaceReady', catId: fx.catId, cwd: '/task' },
        );
        return;
      case 'MergeBranches':
        this.queue.push({
          type: 'MergeFinished',
          catId: fx.catId,
          results: fx.branches.map((b) => ({ ...b, outcome: { ok: true } as const })),
        });
        return;
      case 'SpawnTurn':
        this.spawned.push(fx);
        this.queue.push({ type: 'TurnStarted', catId: fx.catId, turnId: fx.turnId, agentId: n });
        return;
      case 'KillTurn': {
        const turnId = this.state.members[fx.catId]?.turnId;
        if (turnId) {
          const result = { ok: false, error: 'killed', sessionStarted: true };
          this.queue.push({ type: 'TurnFinished', catId: fx.catId, turnId, result });
        }
        return;
      }
      case 'CommitWorktree':
        this.queue.push({ type: 'CommitFinished', assignmentId: fx.assignmentId, ok: true });
        return;
      case 'StartTimer':
        this.timers.set(fx.id, fx.ms);
        return;
      case 'CancelTimer':
        this.timers.delete(fx.id);
        return;
      case 'Emit':
        this.emitted.push(fx.message);
        return;
      case 'Message':
        this.messages.push(fx);
        return;
      case 'FinalizeWorkspaces':
        this.queue.push({ type: 'FinalizeFinished' });
        return;
      case 'EndTask':
        this.ended = true;
        return;
      case 'ReleaseTurn':
      case 'Log':
      case 'RequestReview':
        return;
    }
  }
}

/** Boss delegates `w1` (and optionally `mid`); returns the sim with both workers running. */
export function delegated(opts: SimOptions = {}, to: string[] = ['w1']): Sim {
  const sim = new Sim(opts);
  sim.tool('boss', 'brief', { plan: 'plan' });
  for (const id of to) sim.tool('boss', 'delegate', { to: id, task: `job of ${id}` });
  sim.finish('boss', { text: 'delegated' });
  return sim;
}
