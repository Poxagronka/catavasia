/**
 * Task machine rows T1-T15 and the review region (task-state-machine.md §3),
 * on the pure reducer. The Sim checks the invariants after every event.
 */

import { describe, expect, it } from 'vitest';

import { FLOW_MAX_TURNS } from '../src/constants.js';
import { RESUME_NOTE } from '../src/orchestrator/flowPrompts.js';
import { reduce } from '../src/orchestrator/machine/taskReducer.js';
import type { TaskState } from '../src/orchestrator/machine/types.js';
import { cat, delegated, Sim } from './machineSim.js';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

describe('task machine', () => {
  it('T1: starts in briefing, joins the root and gives it the task', () => {
    const sim = new Sim();
    expect(sim.state.phase).toBe('briefing');
    expect(sim.effects.slice(0, 3).map((e) => e.type)).toEqual(['JoinMember', 'Emit', 'Message']);
    expect(sim.flowStates()).toEqual(['briefing']);
    expect(sim.messages[0]).toMatchObject({ from: 'user', to: 'boss', kind: 'task' });
    expect(sim.running()).toEqual(['boss']);
    expect(sim.lastMessage('boss')).toContain('[Task from the user, task t1]');
    expect(sim.state.members.boss).toMatchObject({
      sessionId: expect.any(String),
      promptSha: 'sha-boss',
    });
  });

  it('T2, T3: brief -> delegating, delegate -> working', () => {
    const sim = new Sim();
    sim.tool('boss', 'brief', { plan: 'p' });
    expect(sim.state.phase).toBe('delegating');
    expect(sim.state.brief).toBe('p');
    sim.tool('boss', 'delegate', { to: 'w1', task: 'x' });
    expect(sim.state.phase).toBe('working');
    // T3 also from briefing.
    const direct = new Sim();
    direct.tool('boss', 'delegate', { to: 'w1', task: 'x' });
    expect(direct.flowStates()).toEqual(['briefing', 'working']);
  });

  it('T4, T5: the last settled assignment -> reporting; a new delegate -> working', () => {
    const sim = delegated();
    sim.tool('w1', 'report', { result: 'done' });
    sim.finish('w1');
    expect(sim.state.phase).toBe('reporting');
    sim.tool('boss', 'delegate', { to: 'mid', task: 'more' });
    expect(sim.state.phase).toBe('working');
  });

  it('T6, T8: the root final -> finalizing (merging) -> done; no review without the Cat CEO', () => {
    const sim = delegated({}, ['w1', 'mid']);
    sim.tool('w1', 'report', { result: 'w1 done' });
    sim.finish('w1');
    // mid still runs: the root may not give the result.
    sim.finish('boss', { text: 'waiting' });
    expect(sim.tool('boss', 'report', { result: 'r' }).text).toContain('Wait: mid');
    sim.tool('mid', 'report', { result: 'mid done' });
    sim.finish('mid');
    expect(sim.tool('boss', 'report', { result: 'all done' }).isError).toBeUndefined();
    sim.finish('boss', { text: 'final' });
    expect(sim.flowStates().slice(-3)).toEqual(['reporting', 'merging', 'done']);
    expect(sim.state).toMatchObject({
      phase: 'done',
      result: 'all done',
      review: 'review_skipped',
    });
    expect(sim.state.assignments.map((a) => a.state)).toEqual(['done', 'done']);
    expect(sim.ended).toBe(true);
  });

  it('T6 guard: a final result with an unread report is dropped', () => {
    const sim = delegated();
    sim.tool('w1', 'report', { result: 'r' });
    sim.finish('w1');
    // The boss reads the report in the turn that runs now; a new one arrives meanwhile.
    expect(sim.state.members.boss.unreadReports).toBe(0);
    sim.state.members.boss.unreadReports = 1;
    sim.tool('boss', 'report', { result: 'too early' });
    expect(sim.state.members.boss.final).toBeUndefined();
  });

  it('T7: an idle root is nudged once, then its last text is the result', () => {
    const sim = new Sim({ cats: [cat('solo', null)] });
    sim.finish('solo', { text: 'thinking' });
    expect(sim.messages.at(-1)).toMatchObject({ kind: 'nudge', to: 'solo' });
    sim.finish('solo', { text: 'here it is' });
    expect(sim.state).toMatchObject({ phase: 'done', result: 'here it is' });
    expect(sim.messages.at(-1)).toMatchObject({ kind: 'final', from: 'solo', text: 'here it is' });
  });

  it('T9: a finalize error ends in error and keeps the result', () => {
    const sim = new Sim({ cats: [cat('solo', null)], manual: ['FinalizeWorkspaces'] });
    sim.tool('solo', 'report', { result: 'res' });
    sim.finish('solo');
    expect(sim.state.phase).toBe('finalizing');
    sim.send({ type: 'FinalizeFinished', error: 'worktree kept' });
    expect(sim.state).toMatchObject({ phase: 'error', result: 'res', error: 'worktree kept' });
  });

  it('T10: a root turn that fails after its retry ends the task with an error', () => {
    const sim = new Sim({ cats: [cat('solo', null)] });
    sim.finish('solo', { ok: false, error: 'crash' });
    sim.fire('retry:solo');
    sim.finish('solo', { ok: false, error: 'crash again' });
    expect(sim.state).toMatchObject({ phase: 'error', error: 'Solo (solo) failed: crash again' });
    expect(sim.flowStates()).toEqual(['briefing', 'error']);
  });

  it('T11: a grant past FLOW_MAX_TURNS stops the task', () => {
    const sim = new Sim({ cats: [cat('solo', null)] });
    sim.state.turns = FLOW_MAX_TURNS;
    sim.finish('solo', { text: 'idle' }); // the nudge asks for one more turn
    expect(sim.state.turns).toBe(FLOW_MAX_TURNS);
    expect(sim.state).toMatchObject({
      phase: 'error',
      error: `Stopped: the team used more than ${FLOW_MAX_TURNS} turns.`,
    });
  });

  it('T12: cancel kills the turns, cancels open assignments, ends cancelled without review', () => {
    const sim = delegated({ catCeo: true });
    sim.send({ type: 'CancelRequested' });
    expect(sim.effects.filter((e) => e.type === 'KillTurn').map((e) => e.catId)).toEqual(['w1']);
    expect(sim.state.assignments[0].state).toBe('cancelled');
    expect(sim.state).toMatchObject({ phase: 'cancelled', error: 'Cancelled by the user.' });
    expect(sim.state.review).toBeUndefined();
    expect(sim.flowStates().slice(-1)).toEqual(['cancelled']);
    expect(sim.flowStates()).not.toContain('merging');
  });

  it('T13, T14: restart -> interrupted; Resume returns to H and reads the lost message again', () => {
    const sim = delegated();
    const w1 = sim.state.members.w1;
    const session = w1.sessionId;
    const lost = sim.lastMessage('w1');
    sim.send({ type: 'ServerRestarted' });
    expect(sim.state).toMatchObject({ phase: 'interrupted', history: 'working' });
    expect(sim.state.members.w1).toMatchObject({ turn: 'idle', joined: false, inFlight: [lost] });
    expect(sim.state.assignments[0].state).toBe('working'); // A18
    sim.send({ type: 'ResumeRequested' });
    expect(sim.state.phase).toBe('working');
    // w1 never finished a turn: a new session. The boss keeps its session.
    expect(sim.state.members.w1.sessionId).not.toBe(session);
    expect(sim.lastMessage('w1')).toBe(`${RESUME_NOTE}\n\n---\n\n${lost}`);
    expect(sim.flowStates().slice(-2)).toEqual(['interrupted', 'working']);
  });

  it('T14 keeps a started session and commits a report the restart cut off', () => {
    const sim = delegated({ repo: true, manual: ['CommitWorktree'] });
    sim.tool('w1', 'report', { result: 'r' });
    sim.finish('w1');
    expect(sim.state.assignments[0].state).toBe('reporting');
    const session = sim.state.members.boss.sessionId;
    sim.send({ type: 'ServerRestarted' });
    sim.held.length = 0;
    sim.send({ type: 'ResumeRequested' });
    expect(sim.state.members.boss.sessionId).toBe(session);
    expect(sim.held.map((e) => e.type)).toEqual(['CommitWorktree']);
  });

  it('T15: cancel from interrupted', () => {
    const sim = delegated();
    sim.send({ type: 'ServerRestarted' });
    sim.send({ type: 'CancelRequested' });
    expect(sim.state.phase).toBe('cancelled');
  });

  it('I6: every path out of briefing announces a non-briefing state', () => {
    for (const event of ['CancelRequested', 'ServerRestarted'] as const) {
      const sim = new Sim();
      sim.send({ type: event });
      expect(sim.flowStates().at(-1)).not.toBe('briefing');
    }
  });

  it('review region: pending -> reviewing -> reviewed or failed; error tasks are reviewed too', () => {
    const sim = new Sim({ cats: [cat('solo', null)], catCeo: true });
    sim.tool('solo', 'report', { result: 'r' });
    sim.finish('solo');
    expect(sim.state.review).toBe('review_pending');
    expect(sim.effects.at(-1)).toEqual({ type: 'RequestReview', taskId: 't1' });
    sim.send({ type: 'ReviewStarted', reviewId: 'r1' });
    expect(sim.state.review).toBe('reviewing');
    sim.send({ type: 'ReviewFinished', reviewId: 'r1' });
    expect(sim.state).toMatchObject({ review: 'reviewed', phase: 'done', result: 'r' });

    const failed = new Sim({ cats: [cat('solo', null)], catCeo: true });
    failed.state.members.solo.retries = 1;
    failed.finish('solo', { ok: false, error: 'x' });
    expect(failed.state).toMatchObject({ phase: 'error', review: 'review_pending' });
    failed.send({ type: 'ReviewStarted', reviewId: 'r2' });
    failed.send({ type: 'ReviewFailed', error: 'judge down' });
    expect(failed.state.review).toBe('review_failed');
  });

  it('review region: a task without a cat turn is not reviewed', () => {
    const sim = new Sim({ cats: [cat('solo', null)], catCeo: true, manual: ['RequestTurn'] });
    sim.send({ type: 'CancelRequested' });
    expect(sim.state.review).toBeUndefined();
    const s: TaskState = { ...sim.state, phase: 'finalizing', finalize: { mode: 'ok', text: 'x' } };
    expect(reduce(s, { type: 'FinalizeFinished' }).state.review).toBe('review_skipped');
  });

  it('I10: every catTurnStarted has one catTurnFinished', () => {
    const sim = delegated({ repo: true }, ['w1', 'mid']);
    sim.tool('mid', 'delegate', { to: 'deep', task: 'part' });
    sim.finish('mid', { text: 'waiting' });
    sim.tool('deep', 'report', { result: 'deep done' });
    sim.finish('deep');
    sim.tool('mid', 'report', { result: 'mid done' });
    sim.finish('mid');
    sim.tool('w1', 'report', { result: 'w1 done' });
    sim.finish('w1');
    // The boss reads one report per turn as they arrive, then gives the result.
    for (let i = 0; i < 3 && sim.state.phase !== 'done'; i++) {
      sim.tool('boss', 'report', { result: 'all' });
      sim.finish('boss');
    }
    expect(sim.state.phase).toBe('done');
    const starts = sim.emitted.filter((m) => m.type === 'catTurnStarted').length;
    const ends = sim.emitted.filter((m) => m.type === 'catTurnFinished').length;
    expect(starts).toBe(ends);
    expect(starts).toBe(sim.state.turns);
  });

  it('I11: reduce is pure and deterministic', () => {
    const sim = delegated({ repo: true });
    const frozen = deepFreeze(structuredClone(sim.state));
    const event = {
      type: 'ToolCalled',
      catId: 'w1',
      name: 'report',
      args: { result: 'r' },
    } as const;
    const a = reduce(frozen, event);
    const b = reduce(frozen, event);
    expect(a).toEqual(b);
    expect(a.state).not.toBe(frozen);
  });
});
