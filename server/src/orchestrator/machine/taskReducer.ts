/**
 * The task machine (task-state-machine.md §3): `reduce(state, event)`.
 * Pure: no clock, no random, no I/O (I11). The input state is not changed.
 */

import { RESUME_NOTE, rootTaskMessage } from '../flowPrompts.js';
import { commitEffect, onCommitFinished } from './assignmentReducer.js';
import {
  deliver,
  type Draft,
  emitFlowState,
  enterFinalizing,
  isActive,
  kick,
  message,
  newMember,
  setPhase,
  toIdle,
} from './helpers.js';
import { runOfficeTool } from './officeToolRules.js';
import {
  onLockBusy,
  onMergeFinished,
  onTimer,
  onTurnFinished,
  onTurnGranted,
  onTurnStarted,
  onWorkspaceFailed,
  onWorkspaceReady,
} from './turnReducer.js';
import type { Effect, MemberState, Step, TaskEvent, TaskState } from './types.js';

const ENDED: Step['reply'] = { text: 'This task has ended.', isError: true };

/** T1: the state a task starts from. */
export function startTask(e: Extract<TaskEvent, { type: 'TaskStarted' }>): Step {
  const root = e.cats.find((c) => c.id === e.rootId);
  if (!root) throw new Error(`Unknown cat ${e.rootId}`);
  const s: TaskState = {
    taskId: e.taskId,
    rootId: e.rootId,
    prompt: e.prompt,
    cats: e.cats,
    runnable: e.runnable,
    repo: e.repo,
    catCeo: e.catCeo,
    phase: 'briefing',
    turns: 0,
    costUsd: 0,
    members: {},
    assignments: [],
  };
  const d: Draft = { s, fx: [] };
  s.members[e.rootId] = {
    ...newMember(e.rootId),
    cwd: e.cwd,
    ...(e.worktreePath ? { worktreePath: e.worktreePath } : {}),
    ...(e.branch ? { branch: e.branch } : {}),
  };
  d.fx.push({ type: 'JoinMember', catId: e.rootId });
  emitFlowState(d);
  message(d, 'user', e.rootId, 'task', e.prompt);
  deliver(d, e.rootId, rootTaskMessage(e.taskId, e.prompt, root, e.cats));
  return { state: s, effects: d.fx };
}

export function reduce(state: TaskState, event: TaskEvent): Step {
  const d: Draft = { s: structuredClone(state), fx: [] };
  const reply = apply(d, event);
  return { state: d.s, effects: d.fx, ...(reply ? { reply } : {}) };
}

function apply(d: Draft, e: TaskEvent): Step['reply'] | void {
  const { s } = d;
  switch (e.type) {
    case 'TaskStarted':
      throw new Error('TaskStarted starts a task: use startTask');
    case 'MemberJoined': {
      const m = s.members[e.catId];
      if (!m) return;
      Object.assign(m, { joined: true, sessionId: e.sessionId });
      if (e.promptSha) {
        m.promptSha = e.promptSha;
        for (const a of s.assignments) if (a.child === e.catId) a.promptSha ??= e.promptSha;
      }
      kick(d, e.catId);
      return;
    }
    case 'ToolCalled':
      if (!isActive(s.phase)) return ENDED;
      return runOfficeTool(d, e.catId, e.name, e.args);
    case 'UserMessage':
      if (!isActive(s.phase)) return;
      d.fx.push({ type: 'Log', entry: { kind: 'user', text: e.text } });
      deliver(d, e.catId, `[Message from the user]\n${e.text}`);
      return;
    case 'TurnGranted':
      return onTurnGranted(d, e);
    case 'TurnLockBusy':
      return onLockBusy(d, e.catId);
    case 'WorkspaceReady':
      return onWorkspaceReady(d, e);
    case 'WorkspaceFailed':
      return onWorkspaceFailed(d, e);
    case 'MergeFinished':
      return onMergeFinished(d, e);
    case 'TurnStarted':
      return onTurnStarted(d, e);
    case 'TurnFinished':
      return onTurnFinished(d, e);
    case 'CommitFinished':
      return onCommitFinished(d, e.assignmentId, e.ok, e.error);
    case 'TimerFired':
      return onTimer(d, e.id);
    case 'FinalizeFinished':
      return onFinalizeFinished(d, e.error);
    case 'CancelRequested':
      // T12, T15
      if (isActive(s.phase) || s.phase === 'interrupted') {
        enterFinalizing(d, 'cancel', 'Cancelled by the user.');
      }
      return;
    case 'ServerRestarted':
      return onRestarted(d);
    case 'ResumeRequested':
      return onResume(d);
    case 'OfficeFailed':
      if (isActive(s.phase)) enterFinalizing(d, 'fail', `Office error: ${e.error}`);
      return;
    case 'ReviewStarted':
      if (s.review === 'review_pending') s.review = 'reviewing';
      return;
    case 'ReviewFinished':
      if (s.review === 'reviewing') s.review = 'reviewed';
      return;
    case 'ReviewFailed':
      // A full queue fails a review before it starts.
      if (s.review === 'reviewing' || s.review === 'review_pending') s.review = 'review_failed';
      return;
    case 'ToolActivity':
    case 'CompactHappened':
      return;
    default: {
      const never: never = e;
      throw new Error(`Unknown event ${JSON.stringify(never)}`);
    }
  }
}

/** T8, T9 (and the end of the cancel path), then the review region (§3.4). */
function onFinalizeFinished(d: Draft, error: string | undefined): void {
  const { s } = d;
  if (s.phase !== 'finalizing' || !s.finalize) return;
  const { mode, text } = s.finalize;
  if (mode === 'ok') s.result = text;
  else s.error = text;
  if (error) s.error = s.error ? `${s.error}\n${error}` : error;
  for (const m of Object.values(s.members)) dropTurn(d, m);
  const phase = mode === 'cancel' ? 'cancelled' : mode === 'ok' && !error ? 'done' : 'error';
  setPhase(d, phase);
  d.fx.push({ type: 'EndTask' });
  if (phase === 'cancelled') return;
  // The Cat CEO reviews after the user has the result; it never blocks it.
  if (s.catCeo && s.turns > 0) {
    s.review = 'review_pending';
    d.fx.push({ type: 'RequestReview', taskId: s.taskId });
  } else {
    s.review = 'review_skipped';
  }
}

/** The turn region goes idle and any held scheduler slot goes back. */
function dropTurn(d: Draft, m: MemberState): void {
  if (m.turn !== 'idle') toIdle(d, m);
  if (m.holdsSlot) d.fx.push({ type: 'ReleaseTurn', catId: m.catId });
  m.holdsSlot = false;
}

/** T13: the server stopped. Running turns stop; their messages stay for Resume. */
function onRestarted(d: Draft): void {
  const { s } = d;
  if (!isActive(s.phase) && s.phase !== 'finalizing') return;
  s.history = s.phase as NonNullable<TaskState['history']>;
  setPhase(d, 'interrupted');
  for (const m of Object.values(s.members)) {
    if (m.turn === 'running') d.fx.push({ type: 'KillTurn', catId: m.catId });
    dropTurn(d, m);
    // A report or result of a turn that did not finish does not count.
    Object.assign(m, { joined: false, retryWait: false, timedOut: false, askedThisTurn: [] });
    m.outgoingReport = undefined;
    m.final = undefined;
  }
}

/** T14: back to the saved phase. Members re-join (new MCP tokens) and read again. */
function onResume(d: Draft): void {
  const { s } = d;
  if (s.phase !== 'interrupted' || !s.history) return;
  const phase = s.history;
  s.history = undefined;
  setPhase(d, phase);
  const fx: Effect[] = [];
  for (const m of Object.values(s.members)) {
    if (m.inFlight.length) m.inbox.unshift(RESUME_NOTE, ...m.inFlight);
    m.inFlight = [];
    // A session that never finished a turn may be half-made on disk: start a new one.
    fx.push({
      type: 'JoinMember',
      catId: m.catId,
      ...(m.started ? { sessionId: m.sessionId } : {}),
    });
  }
  d.fx.push(...fx);
  for (const a of s.assignments) {
    const wt = s.members[a.child]?.worktreePath;
    if (a.state === 'reporting' && wt) {
      d.fx.push(commitEffect(d, a, wt));
    }
  }
  if (phase === 'finalizing') d.fx.push({ type: 'FinalizeWorkspaces', mode: s.finalize!.mode });
}
