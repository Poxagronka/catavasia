/**
 * Invariants of task-state-machine.md §6 that the state alone can show.
 * Tests check them after every event; in production a violation ends the
 * task with an error (the interpreter). I1 across tasks lives in the
 * TurnScheduler; I6, I7, I10 are event-sequence checks in the tests; I11 is
 * the reducer's purity.
 */

import { FLOW_MAX_TURNS } from '../../constants.js';
import { isActive, isOpen, isTerminal } from './helpers.js';
import type { TaskState } from './types.js';

export function checkInvariants(s: TaskState): string[] {
  const problems: string[] = [];
  const open = s.assignments.filter(isOpen);
  // I2: one open assignment per cat.
  for (const a of open) {
    if (open.filter((b) => b.child === a.child).length > 1) {
      problems.push(`I2: ${a.child} has more than one open assignment`);
    }
  }
  // I3: a cat reports only when nothing below it is open and every report was read.
  for (const a of s.assignments.filter((x) => x.state === 'reporting')) {
    if (open.some((b) => b.parent === a.child)) {
      problems.push(`I3: ${a.child} reports while an assignment below it is open`);
    }
  }
  // I4: a report reaches the parent only with its text, after the commit.
  for (const a of s.assignments) {
    if ((a.state === 'reported' || a.state === 'done') && a.report === undefined) {
      problems.push(`I4: assignment ${a.id} is ${a.state} without a committed report`);
    }
  }
  // I8
  if (s.turns > FLOW_MAX_TURNS) problems.push(`I8: ${s.turns} turns`);
  for (const m of Object.values(s.members)) {
    // I1 inside the task: a turn that holds a slot has its id.
    if ((m.turn === 'preparing' || m.turn === 'running') && !m.turnId) {
      problems.push(`I1: ${m.catId} is ${m.turn} without a turn id`);
    }
    // I9: no turn after the task ended.
    if ((isTerminal(s.phase) || s.phase === 'interrupted') && m.turn !== 'idle') {
      problems.push(`I9: ${m.catId} is ${m.turn} in ${s.phase}`);
    }
    if (m.turn === 'idle' && m.inFlight.length && s.phase !== 'interrupted') {
      problems.push(`R7: ${m.catId} is idle with an unread in-flight message`);
    }
  }
  // T4: `reporting` means every assignment settled; `working` has one open.
  if (s.phase === 'reporting' && open.length) problems.push('T4: reporting with open assignments');
  if (s.phase === 'working' && !open.length) problems.push('T4: working with no open assignment');
  if (isActive(s.phase) && s.finalize) problems.push('T6: active phase after finalize');
  return problems;
}
