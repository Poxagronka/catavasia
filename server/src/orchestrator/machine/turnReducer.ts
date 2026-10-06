/**
 * Turn region (task-state-machine.md §5): one per member cat.
 * idle -> queued -> preparing (worktree, merges) -> running -> idle.
 */

import { FLOW_MAX_TURNS, SESSION_LOCK_RETRY_MS, TURN_TIMEOUT_MS } from '../../constants.js';
import { catLabel, mergeNote, TURN_PART_SEPARATOR, unfinishedMergeNote } from '../flowPrompts.js';
import { afterTurn } from './assignmentReducer.js';
import {
  catOf,
  type Draft,
  enterFinalizing,
  flushReport,
  isActive,
  kick,
  openAssignmentOf,
  releaseSlot,
  toIdle,
} from './helpers.js';
import type { MemberState, TaskEvent } from './types.js';

type EventOf<T extends TaskEvent['type']> = Extract<TaskEvent, { type: T }>;

/** R2: the scheduler gave the cat a slot (and the session lock). */
export function onTurnGranted(d: Draft, e: EventOf<'TurnGranted'>): void {
  const m = d.s.members[e.catId];
  if (!m || m.turn !== 'queued' || !isActive(d.s.phase)) {
    // A stale grant (the task stopped, or the turn was dropped): give the slot back.
    d.fx.push({ type: 'ReleaseTurn', catId: e.catId });
    if (m?.turn === 'queued') m.turn = 'idle';
    return;
  }
  if (d.s.turns >= FLOW_MAX_TURNS) {
    // T11, I8
    d.fx.push({ type: 'ReleaseTurn', catId: e.catId });
    m.turn = 'idle';
    return enterFinalizing(d, 'fail', `Stopped: the team used more than ${FLOW_MAX_TURNS} turns.`);
  }
  d.s.turns++;
  m.turn = 'preparing';
  m.turnId = e.turnId;
  continuePreparing(d, m);
}

/** R3: the user holds the session in a terminal (the wheel): try again later. */
export function onLockBusy(d: Draft, catId: string): void {
  const m = d.s.members[catId];
  if (!m || m.turn !== 'queued') return;
  if (!isActive(d.s.phase)) {
    m.turn = 'idle';
    return;
  }
  m.turn = 'lock_wait';
  d.fx.push({ type: 'StartTimer', id: `lock:${catId}`, ms: SESSION_LOCK_RETRY_MS });
}

/** Worktree first, then the merges of the reports it received (I4, I5), then the turn. */
function continuePreparing(d: Draft, m: MemberState): void {
  if (!m.cwd) {
    d.fx.push({ type: 'PrepareWorkspace', catId: m.catId });
    return;
  }
  // Nothing to merge into (or no branch): the reports are read as they are.
  for (const c of m.pendingMerges) {
    if (!m.worktreePath || !d.s.members[c]?.branch) flushReport(m, c);
  }
  if (!m.worktreePath) m.pendingMerges = [];
  m.pendingMerges = m.pendingMerges.filter((c) => d.s.members[c]?.branch);
  if (m.pendingMerges.length && m.worktreePath) {
    d.fx.push({
      type: 'MergeBranches',
      catId: m.catId,
      worktreePath: m.worktreePath,
      branches: m.pendingMerges.map((c) => ({ childId: c, branch: d.s.members[c].branch! })),
    });
    return;
  }
  startTurn(d, m);
}

export function onWorkspaceReady(d: Draft, e: EventOf<'WorkspaceReady'>): void {
  const m = d.s.members[e.catId];
  if (!m) return;
  // Recorded even when the task stopped meanwhile: finalize removes the worktree.
  Object.assign(m, { cwd: e.cwd, worktreePath: e.worktreePath, branch: e.branch });
  if (m.turn !== 'preparing' || !isActive(d.s.phase)) return toIdle(d, m);
  continuePreparing(d, m);
}

export function onWorkspaceFailed(d: Draft, e: EventOf<'WorkspaceFailed'>): void {
  const m = d.s.members[e.catId];
  if (!m) return;
  toIdle(d, m);
  enterFinalizing(d, 'fail', `${catLabel(catOf(d.s, e.catId))}: ${e.error}`);
}

/** A10 / A11: merge notes go first in the next message; a conflict blocks later merges. */
export function onMergeFinished(d: Draft, e: EventOf<'MergeFinished'>): void {
  const m = d.s.members[e.catId];
  if (!m) return;
  if (e.error) {
    toIdle(d, m);
    return enterFinalizing(d, 'fail', `${catLabel(catOf(d.s, e.catId))}: ${e.error}`);
  }
  if (e.blocked) {
    m.notes.push(unfinishedMergeNote(e.blocked));
    m.conflict = true;
  } else {
    m.conflict = false;
    for (const r of e.results) {
      m.pendingMerges = m.pendingMerges.filter((c) => c !== r.childId);
      m.notes.push(mergeNote(catOf(d.s, r.childId), r.branch, r.outcome));
      flushReport(m, r.childId);
      if (!r.outcome.ok && r.outcome.conflicts.length) m.conflict = true;
    }
  }
  if (m.turn !== 'preparing' || !isActive(d.s.phase)) return toIdle(d, m);
  startTurn(d, m);
}

/** R5: take the inbox (merge notes first) and spawn the turn. */
function startTurn(d: Draft, m: MemberState): void {
  const parts = [...m.notes, ...m.inbox];
  m.notes = [];
  m.inbox = [];
  // Reports whose branch still waits (after a conflict) stay unread.
  m.unreadReports = m.pendingMerges.length;
  if (parts.length === 0) return toIdle(d, m);
  m.inFlight = parts;
  // Questions this turn reads; one that arrives mid-turn waits for the next turn.
  m.askedThisTurn = [...m.askedBy];
  m.turn = 'running';
  d.fx.push({
    type: 'SpawnTurn',
    catId: m.catId,
    turnId: m.turnId!,
    sessionId: m.sessionId!,
    resume: m.started,
    cwd: m.cwd!,
    message: parts.join(TURN_PART_SEPARATOR),
  });
  d.fx.push({ type: 'StartTimer', id: `turn:${m.turnId}`, ms: TURN_TIMEOUT_MS });
}

/** R6, A2, A7, A9, A10: the process runs; the cat's open assignment works. */
export function onTurnStarted(d: Draft, e: EventOf<'TurnStarted'>): void {
  const m = d.s.members[e.catId];
  if (!m || m.turnId !== e.turnId) return;
  m.agentId = e.agentId;
  const mine = openAssignmentOf(d.s, e.catId);
  if (mine && mine.state !== 'reporting') mine.state = 'working';
  d.fx.push({
    type: 'Emit',
    message: { type: 'catTurnStarted', catId: e.catId, taskId: d.s.taskId, id: e.agentId },
  });
}

/** R7: cost, `catTurnFinished`, then the assignment rules. */
export function onTurnFinished(d: Draft, e: EventOf<'TurnFinished'>): void {
  const m = d.s.members[e.catId];
  if (!m || m.turnId !== e.turnId || m.turn !== 'running') return;
  const r = e.result;
  d.fx.push({ type: 'CancelTimer', id: `turn:${e.turnId}` });
  m.started ||= r.sessionStarted;
  if (r.sessionId) m.sessionId = r.sessionId;
  const sessionCost = r.sessionCostUsd ?? m.sessionCostUsd;
  const costUsd = Math.max(0, sessionCost - m.sessionCostUsd);
  m.sessionCostUsd = sessionCost;
  d.s.costUsd += costUsd;
  d.fx.push({
    type: 'Emit',
    message: {
      type: 'catTurnFinished',
      catId: e.catId,
      taskId: d.s.taskId,
      id: m.agentId ?? -1,
      ok: r.ok,
      costUsd,
      inputTokens: r.usage?.inputTokens,
      cacheReadTokens: r.usage?.cacheReadTokens,
      cacheCreationTokens: r.usage?.cacheCreationTokens,
      outputTokens: r.usage?.outputTokens,
    },
  });
  const timedOut = m.timedOut;
  m.timedOut = false;
  const result = timedOut
    ? { ...r, ok: false, error: `the turn ran longer than ${TURN_TIMEOUT_MS / 60_000} minutes` }
    : r;
  if (!result.ok) {
    const name = catOf(d.s, e.catId).name;
    d.fx.push({ type: 'Log', entry: { kind: 'error', name, text: result.error ?? '' } });
  }
  const inFlight = m.inFlight;
  m.inFlight = [];
  m.turn = 'idle';
  m.turnId = undefined;
  m.holdsSlot = true;
  if (isActive(d.s.phase)) afterTurn(d, m, result, timedOut, inFlight);
  // A report commit keeps the slot until CommitFinished (the parent's next turn sees it).
  releaseSlot(d, m);
  kick(d, e.catId);
}

/** R4 (lock), R8 (turn timeout), A14 (retry delay). */
export function onTimer(d: Draft, id: string): void {
  const [kind, key] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)];
  if (kind === 'turn') {
    const m = Object.values(d.s.members).find((x) => x.turnId === key && x.turn === 'running');
    if (!m) return;
    m.timedOut = true;
    d.fx.push({ type: 'KillTurn', catId: m.catId });
    return;
  }
  const m = d.s.members[key];
  if (!m) return;
  if (kind === 'retry') {
    m.retryWait = false;
    kick(d, key);
  } else if (kind === 'lock' && m.turn === 'lock_wait') {
    if (!isActive(d.s.phase)) {
      m.turn = 'idle';
      return;
    }
    m.turn = 'queued';
    d.fx.push({ type: 'RequestTurn', catId: key });
  }
}
