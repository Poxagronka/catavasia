/**
 * Small pure helpers shared by the reducers: a mutable draft (`Draft`) of one
 * step, delivery into a member's inbox, the wire projection of the task
 * state, and the entry into `finalizing`.
 */

import type { CatMessageKind, CatProfile, FlowState } from '../../../../core/src/messages.js';
import type { TaskFlow, TaskFlowNode } from '../../../../core/src/tasks.js';
import { isInSubtree } from '../catTree.js';
import type {
  ActivePhase,
  Assignment,
  AssignmentState,
  Effect,
  FinalizeMode,
  MemberState,
  TaskPhase,
  TaskState,
} from './types.js';

/** One reduce step in progress: the draft state and the effects so far. */
export interface Draft {
  s: TaskState;
  fx: Effect[];
}

const ACTIVE: readonly TaskPhase[] = ['briefing', 'delegating', 'working', 'reporting'];
const SETTLED: readonly AssignmentState[] = ['reported', 'done', 'rejected', 'failed', 'cancelled'];

export function isActive(phase: TaskPhase): phase is ActivePhase {
  return ACTIVE.includes(phase);
}

export function isTerminal(phase: TaskPhase): boolean {
  return phase === 'done' || phase === 'error' || phase === 'cancelled';
}

export function isOpen(a: Assignment): boolean {
  return !SETTLED.includes(a.state);
}

/** The cat's open assignment (at most one, I2). */
export function openAssignmentOf(s: TaskState, catId: string): Assignment | undefined {
  return s.assignments.find((a) => a.child === catId && isOpen(a));
}

export function catOf(s: TaskState, catId: string): CatProfile {
  const cat = s.cats.find((c) => c.id === catId);
  if (!cat) throw new Error(`Unknown cat ${catId}`);
  return cat;
}

/** Reports (or their branches) delivered to this cat that it has not read yet. */
export function hasUnread(m: MemberState): boolean {
  return m.unreadReports > 0 || m.pendingMerges.length > 0;
}

export function newMember(catId: string): MemberState {
  return {
    catId,
    joined: false,
    started: false,
    turn: 'idle',
    inbox: [],
    inFlight: [],
    notes: [],
    pendingMerges: [],
    pendingReports: {},
    conflict: false,
    askedBy: [],
    waitingOn: [],
    askedThisTurn: [],
    unreadReports: 0,
    nudged: false,
    retries: 0,
    retryWait: false,
    holdsSlot: false,
    timedOut: false,
    sessionCostUsd: 0,
  };
}

/** The member of `catId`; a cat that is new to the task joins it. */
export function ensureMember(d: Draft, catId: string): MemberState {
  let m = d.s.members[catId];
  if (!m) {
    m = newMember(catId);
    d.s.members[catId] = m;
    d.fx.push({ type: 'JoinMember', catId });
  }
  return m;
}

/** R1: queue a turn for a cat that has something to read, unless one is queued. */
export function kick(d: Draft, catId: string): void {
  const m = d.s.members[catId];
  if (!m || !isActive(d.s.phase) || !m.joined || m.turn !== 'idle' || m.retryWait) return;
  // The office commits its worktree for a report: no turn until that ends.
  if (d.s.assignments.some((a) => a.child === catId && a.state === 'reporting')) return;
  if (m.inbox.length === 0 && m.pendingMerges.length === 0) return;
  m.turn = 'queued';
  d.fx.push({ type: 'RequestTurn', catId });
}

/** The turn region goes back to idle; a held scheduler slot is released. */
export function toIdle(d: Draft, m: MemberState): void {
  if (m.turn === 'preparing' || m.turn === 'running') m.holdsSlot = true;
  m.turn = 'idle';
  m.turnId = undefined;
  releaseSlot(d, m);
}

/** Give the scheduler slot back (after the report commit, when one runs). */
export function releaseSlot(d: Draft, m: MemberState): void {
  if (!m.holdsSlot) return;
  if (d.s.assignments.some((a) => a.child === m.catId && a.state === 'reporting')) return;
  m.holdsSlot = false;
  d.fx.push({ type: 'ReleaseTurn', catId: m.catId });
}

/** The report of a child goes into the notes right after its merge note. */
export function flushReport(m: MemberState, childId: string): void {
  const report = m.pendingReports[childId];
  if (report === undefined) return;
  m.notes.push(report);
  delete m.pendingReports[childId];
}

/** Queue a message for a cat's next turn (it joins the task if needed). */
export function deliver(d: Draft, to: string, text: string): MemberState {
  const m = ensureMember(d, to);
  m.inbox.push(text);
  kick(d, to);
  return m;
}

export function message(
  d: Draft,
  from: string,
  to: string,
  kind: CatMessageKind,
  text: string,
): void {
  d.fx.push({ type: 'Message', from, to, kind, text });
}

export function wireState(phase: TaskPhase): FlowState {
  return phase === 'finalizing' ? 'merging' : phase;
}

/** `flowStateChanged` with the team (root + the cats below it) for the briefing meeting. */
export function emitFlowState(d: Draft): void {
  const { s } = d;
  d.fx.push({
    type: 'Emit',
    message: {
      type: 'flowStateChanged',
      taskId: s.taskId,
      state: wireState(s.phase),
      rootCatId: s.rootId,
      catIds: s.cats.filter((c) => isInSubtree(s.cats, s.rootId, c.id)).map((c) => c.id),
    },
  });
}

/** Change the task phase; the game hears it when the wire state changes. */
export function setPhase(d: Draft, phase: TaskPhase): void {
  const changed = wireState(d.s.phase) !== wireState(phase);
  d.s.phase = phase;
  if (changed) emitFlowState(d);
}

/**
 * T6, T7, T10, T11, T12, T15: stop the turns and finalize the workspaces.
 * Only the success path shows `merging` (phase 1 behaviour).
 */
export function enterFinalizing(d: Draft, mode: FinalizeMode, text: string): void {
  const { s } = d;
  if (s.phase === 'finalizing' || isTerminal(s.phase)) return;
  s.finalize = { mode, text };
  if (mode === 'ok') setPhase(d, 'finalizing');
  else s.phase = 'finalizing';
  for (const m of Object.values(s.members)) {
    if (m.turn === 'running') d.fx.push({ type: 'KillTurn', catId: m.catId });
    if (m.turn === 'lock_wait') d.fx.push({ type: 'CancelTimer', id: `lock:${m.catId}` });
    if (m.retryWait) d.fx.push({ type: 'CancelTimer', id: `retry:${m.catId}` });
    // A queued job still gets its slot later; the reducer releases it at once.
    if (m.turn === 'queued' || m.turn === 'lock_wait') m.turn = 'idle';
    m.retryWait = false;
    // Messages a restart cut off are never read now.
    if (m.turn === 'idle') m.inFlight = [];
  }
  if (mode === 'cancel') {
    for (const a of s.assignments) if (isOpen(a)) a.state = 'cancelled';
  }
  d.fx.push({ type: 'FinalizeWorkspaces', mode });
}

/** A16: the reports this cat read count as accepted once it reports itself. */
export function acceptChildren(d: Draft, catId: string): void {
  for (const a of d.s.assignments) {
    if (a.parent === catId && a.state === 'reported') a.state = 'done';
  }
}

function nodeStatus(state: AssignmentState): TaskFlowNode['status'] {
  if (state === 'failed' || state === 'cancelled') return 'failed';
  return isOpen({ state } as Assignment) ? 'working' : 'reported';
}

/** The task-board view of the state: one node per cat (its newest assignment). */
export function wireFlow(s: TaskState): TaskFlow {
  const nodes: TaskFlowNode[] = [];
  for (const a of s.assignments) {
    const node = { cat: a.child, from: a.parent, goal: a.goal, status: nodeStatus(a.state) };
    const at = nodes.findIndex((n) => n.cat === a.child);
    if (at >= 0) nodes[at] = { ...node, branch: nodes[at].branch };
    else nodes.push({ ...node, branch: a.branch });
  }
  return {
    root: s.rootId,
    state: wireState(s.phase),
    nodes,
    ...(s.brief !== undefined ? { brief: s.brief } : {}),
    turns: s.turns,
  };
}
