/**
 * Assignment machine (task-state-machine.md §4): one per `delegate` call.
 * The rules that run when a cat's turn ends (A3-A6, A14, A15), when its
 * worktree commit ends (A12, A13), and when a cat delegates (A1).
 */

import { TURN_RETRY_DELAY_MS, TURN_RETRY_MAX } from '../../constants.js';
import { catLabel, NUDGE_REPORT, replyMessage, reportMessage } from '../flowPrompts.js';
import {
  acceptChildren,
  catOf,
  deliver,
  type Draft,
  enterFinalizing,
  hasUnread,
  isOpen,
  kick,
  message,
  openAssignmentOf,
  releaseSlot,
  setPhase,
} from './helpers.js';
import type { Assignment, Effect, MemberState, TurnResult } from './types.js';

const NO_TEXT = '(no text)';

/** A1: a new assignment. The caller checked the guards (officeToolRules.ts). */
export function createAssignment(
  d: Draft,
  parent: string,
  child: string,
  goal: string,
  branch: string | undefined,
  rework: boolean,
): Assignment {
  const prev = [...d.s.assignments].reverse().find((a) => a.child === child);
  if (prev?.state === 'reported') prev.state = rework ? 'rejected' : 'done';
  const a: Assignment = {
    id: `a${d.s.assignments.length + 1}`,
    parent,
    child,
    goal,
    state: 'assigned',
    ...(branch ? { branch } : {}),
    ...(rework && prev ? { reworkOf: prev.id } : {}),
  };
  const sha = d.s.members[child]?.promptSha;
  if (sha) a.promptSha = sha;
  d.s.assignments.push(a);
  return a;
}

/** A12 / A13 / A15: the report (or failure report) reaches the parent's inbox. */
function completeReport(d: Draft, a: Assignment, text: string, failed: boolean): void {
  const { s } = d;
  a.state = failed ? 'failed' : 'reported';
  a.failed = failed;
  const child = s.members[a.child];
  if (child) child.nudged = false;
  const parent = s.members[a.parent];
  const report = reportMessage(catOf(s, a.child), text, failed);
  if (parent) parent.unreadReports++;
  if (parent && a.branch && !failed) {
    // I4: the report is read right after its branch merged into the parent's worktree.
    parent.pendingMerges.push(a.child);
    parent.pendingReports[a.child] = report;
    // A8: the parent's own assignment waits for this merge.
    const own = openAssignmentOf(s, a.parent);
    if (own?.state === 'awaiting_children') own.state = 'merging';
    kick(d, a.parent);
  } else {
    deliver(d, a.parent, report);
  }
  // T4: the last open assignment of the task settled.
  if (s.phase === 'working' && !s.assignments.some(isOpen)) {
    setPhase(d, 'reporting');
  }
}

/** A3 / A6: the child reports; its worktree is committed first (I4). */
function beginReport(d: Draft, a: Assignment, text: string): void {
  a.state = 'reporting';
  a.report = text;
  acceptChildren(d, a.child);
  const m = d.s.members[a.child];
  if (!m?.worktreePath) return completeReport(d, a, text, false);
  d.fx.push(commitEffect(d, a, m.worktreePath));
}

/** The office commits the child's worktree before its report goes up (I4). */
export function commitEffect(d: Draft, a: Assignment, worktreePath: string): Effect {
  const firstLine = a.goal.split('\n')[0].slice(0, 72);
  const message = `${catLabel(catOf(d.s, a.child))}: ${firstLine}`;
  return { type: 'CommitWorktree', assignmentId: a.id, worktreePath, message };
}

export function onCommitFinished(d: Draft, assignmentId: string, ok: boolean, error?: string) {
  const a = d.s.assignments.find((x) => x.id === assignmentId);
  if (!a) return;
  if (a.state !== 'reporting') {
    // Cancelled meanwhile: only the held slot goes back.
    const child = d.s.members[a.child];
    if (child) releaseSlot(d, child);
    return;
  }
  const text = a.report ?? '';
  if (ok) completeReport(d, a, text, false);
  else completeReport(d, a, `${text}\n[Office] Could not commit the work: ${error}`, true);
  const child = d.s.members[a.child];
  if (child) releaseSlot(d, child);
  kick(d, a.child);
}

/** A cat with nothing left to wait for must report: one nudge, then auto-report. */
function finishIfIdle(d: Draft, m: MemberState, lastText: string): void {
  const { s } = d;
  const isRoot = m.catId === s.rootId;
  const mine = openAssignmentOf(s, m.catId);
  const owes = isRoot || (mine !== undefined && mine.state !== 'reporting');
  if (!owes) return;
  const busy =
    m.inbox.length > 0 ||
    m.pendingMerges.length > 0 ||
    m.waitingOn.length > 0 ||
    s.assignments.some((a) => a.parent === m.catId && isOpen(a));
  if (busy) {
    if (mine) mine.state = 'awaiting_children'; // A4
    return;
  }
  if (!m.nudged) {
    // A5
    m.nudged = true;
    if (mine) mine.state = 'owing';
    message(d, 'office', m.catId, 'nudge', NUDGE_REPORT);
    deliver(d, m.catId, NUDGE_REPORT);
    return;
  }
  if (isRoot) {
    // T7: the second idle turn's text is the final result.
    message(d, m.catId, 'user', 'final', lastText);
    acceptChildren(d, m.catId);
    return enterFinalizing(d, 'ok', lastText);
  }
  // A6
  message(d, m.catId, mine!.parent, 'report', lastText);
  beginReport(d, mine!, lastText);
}

/**
 * The assignment rules after a turn of an active task (R7). `inFlight` is
 * the message the turn read.
 */
export function afterTurn(
  d: Draft,
  m: MemberState,
  result: TurnResult,
  timedOut: boolean,
  inFlight: string[],
): void {
  const { s } = d;
  const cat = catOf(s, m.catId);
  const isRoot = m.catId === s.rootId;
  // A14: one retry for an infrastructure failure; a timeout or a down engine gets none.
  if (!result.ok && !timedOut && !result.engineDown && m.retries < TURN_RETRY_MAX) {
    m.retries++;
    m.inbox.unshift(...inFlight);
    m.outgoingReport = undefined;
    m.final = undefined;
    m.retryWait = true;
    d.fx.push({ type: 'StartTimer', id: `retry:${m.catId}`, ms: TURN_RETRY_DELAY_MS });
    return;
  }
  m.retries = 0;
  const error = result.error;
  const answer = result.ok ? (result.text ?? NO_TEXT) : `My turn failed: ${error}`;
  // I7: a question this cat did not answer with reply gets its last text (or the failure).
  for (const asker of m.askedThisTurn) {
    if (!m.askedBy.includes(asker)) continue;
    m.askedBy = m.askedBy.filter((c) => c !== asker);
    message(d, m.catId, asker, 'reply', answer);
    const target = deliver(d, asker, replyMessage(cat, answer));
    target.waitingOn = target.waitingOn.filter((c) => c !== m.catId);
  }
  m.askedThisTurn = [];
  if (!result.ok) {
    // A report or result made in a failed turn does not count.
    m.outgoingReport = undefined;
    m.final = undefined;
    // T10. A down engine (logged out) fails the whole task: no cat can fix it.
    if (isRoot || result.engineDown)
      return enterFinalizing(d, 'fail', `${catLabel(cat)} failed: ${error}`);
    const mine = openAssignmentOf(s, m.catId);
    if (mine) completeReport(d, mine, `The turn failed: ${error}`, true); // A15
    return;
  }
  if (m.final !== undefined) {
    // T6. A report that arrived during this turn must be read before the end.
    if (!hasUnread(m)) {
      acceptChildren(d, m.catId);
      return enterFinalizing(d, 'ok', m.final);
    }
    m.final = undefined;
  }
  if (m.outgoingReport !== undefined) {
    const text = m.outgoingReport;
    m.outgoingReport = undefined;
    const mine = openAssignmentOf(s, m.catId);
    if (!hasUnread(m) && mine) beginReport(d, mine, text); // A3
  }
  finishIfIdle(d, m, result.text ?? NO_TEXT);
}
