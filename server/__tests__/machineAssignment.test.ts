/**
 * Assignment machine rows A1-A18 and turn region rows R1-R9
 * (task-state-machine.md §4, §5), on the pure reducer. The Sim checks the
 * invariants I1-I9 after every event.
 */

import { describe, expect, it } from 'vitest';

import { SESSION_LOCK_RETRY_MS, TURN_RETRY_DELAY_MS, TURN_TIMEOUT_MS } from '../src/constants.js';
import { NUDGE_REPORT } from '../src/orchestrator/flowPrompts.js';
import { delegated, Sim } from './machineSim.js';

const states = (sim: Sim) => sim.state.assignments.map((a) => a.state);

describe('assignment machine', () => {
  it('A1, A2: delegate makes an assigned assignment; the turn start makes it working', () => {
    const sim = new Sim({ manual: ['RequestTurn'] });
    sim.held.length = 0;
    const reply = sim.tool('boss', 'delegate', { to: 'w1', task: 'job' });
    expect(reply.text).toContain('Delegated to W1 (w1)');
    expect(sim.state.assignments).toEqual([
      {
        id: 'a1',
        parent: 'boss',
        child: 'w1',
        goal: 'job',
        state: 'assigned',
        promptSha: 'sha-w1',
      },
    ]);
    expect(sim.effects.some((e) => e.type === 'JoinMember' && e.catId === 'w1')).toBe(true);
    expect(sim.state.members.w1.inbox[0]).toContain('[Task from Boss (boss)]\njob');
    sim.send({ type: 'TurnGranted', catId: 'w1', turnId: 'tw' });
    expect(states(sim)).toEqual(['working']);
  });

  it('A1 rework: the previous report is rejected and the new assignment points to it', () => {
    const sim = delegated();
    sim.tool('w1', 'report', { result: 'v1' });
    sim.finish('w1');
    expect(
      sim.tool('boss', 'delegate', { to: 'w1', task: 'fix', rework: true }).isError,
    ).toBeUndefined();
    expect(sim.state.assignments.map((a) => [a.state, a.reworkOf])).toEqual([
      ['rejected', undefined],
      ['working', 'a1'],
    ]);
    expect(sim.lastMessage('w1')).toContain('Rework: your lead did not accept');
    // Without rework the earlier report counts as accepted.
    sim.finish('boss');
    sim.tool('w1', 'report', { result: 'v2' });
    sim.finish('w1');
    sim.tool('boss', 'delegate', { to: 'w1', task: 'next' });
    expect(states(sim)).toEqual(['rejected', 'done', 'working']);
  });

  it('A3, A12: report -> reporting (commit) -> reported; the branch merges before the parent reads it', () => {
    const sim = delegated({ repo: true, manual: ['CommitWorktree'] });
    sim.tool('w1', 'report', { result: 'did it' });
    sim.finish('w1');
    expect(states(sim)).toEqual(['reporting']);
    const commit = sim.held.pop()!;
    expect(commit).toMatchObject({ type: 'CommitWorktree', worktreePath: '/wt/w1' });
    // The turn keeps its slot until the commit ends (I4, phase 1 order).
    expect(sim.effects.filter((e) => e.type === 'ReleaseTurn' && e.catId === 'w1')).toEqual([]);
    sim.send({ type: 'CommitFinished', assignmentId: 'a1', ok: true });
    expect(states(sim)).toEqual(['reported']);
    expect(sim.effects.some((e) => e.type === 'ReleaseTurn' && e.catId === 'w1')).toBe(true);
    const merge = sim.effects.find((e) => e.type === 'MergeBranches');
    expect(merge).toMatchObject({
      catId: 'boss',
      branches: [{ childId: 'w1', branch: 'task/t1-w1' }],
    });
    expect(sim.lastMessage('boss')).toMatch(
      /^\[Office\] Merged branch task\/t1-w1 .*\n\n---\n\n\[Report from W1 \(w1\)\]\ndid it$/,
    );
  });

  it('A4, A8, A10: waits on its own worker, merges the sub-report, works again', () => {
    const sim = delegated({ repo: true }, ['mid']);
    sim.tool('mid', 'delegate', { to: 'deep', task: 'part' });
    sim.finish('mid', { text: 'waiting' });
    expect(states(sim)).toEqual(['awaiting_children', 'working']);
    sim.tool('deep', 'report', { result: 'part done' });
    sim.finish('deep');
    // A8 -> A10 run in one step here: the merge result arrives at once.
    expect(states(sim)).toEqual(['working', 'reported']);
    expect(sim.lastMessage('mid')).toContain('[Report from Deep (deep)]\npart done');
  });

  it('A5, A7, A6: idle without a report -> nudge (owing); idle again -> auto-report', () => {
    const sim = delegated();
    sim.finish('w1', { text: 'thinking' });
    expect(states(sim)).toEqual(['working']); // A5 owing, then A7 working: the nudge turn runs
    expect(sim.messages.at(-1)).toMatchObject({ from: 'office', to: 'w1', kind: 'nudge' });
    expect(sim.lastMessage('w1')).toBe(NUDGE_REPORT);
    sim.finish('w1', { text: 'my result' });
    expect(states(sim)).toEqual(['reported']);
    expect(sim.messages.at(-1)).toMatchObject({
      from: 'w1',
      to: 'boss',
      kind: 'report',
      text: 'my result',
    });
  });

  it('A9: a reply wakes a cat that waits on a question', () => {
    const sim = delegated({}, ['w1', 'mid']);
    sim.tool('w1', 'ask', { to: 'mid', question: 'which file?' });
    sim.finish('w1', { text: 'asked' });
    expect(states(sim)[0]).toBe('awaiting_children');
    sim.tool('mid', 'reply', { to: 'w1', answer: 'a.txt' });
    sim.finish('mid', { text: 'answered' });
    sim.finish('mid', { text: 'still nothing' }); // mid's nudge turn
    expect(states(sim)[0]).toBe('working');
    expect(sim.lastMessage('w1')).toContain('[Reply from Mid (mid)]\na.txt');
  });

  it('A11: a conflict blocks the later branches until the worktree is clean (I5)', () => {
    const sim = delegated({ repo: true, manual: ['MergeBranches'] }, ['w1', 'mid']);
    sim.tool('w1', 'report', { result: 'w1' });
    sim.finish('w1');
    sim.tool('mid', 'report', { result: 'mid' });
    sim.finish('mid');
    const merge = sim.held.find((e) => e.type === 'MergeBranches')!;
    expect(merge).toMatchObject({ branches: [{ childId: 'w1' }] });
    sim.send({
      type: 'MergeFinished',
      catId: 'boss',
      results: [
        {
          childId: 'w1',
          branch: 'task/t1-w1',
          outcome: { ok: false, conflicts: ['a.txt'], error: 'conflict' },
        },
      ],
    });
    expect(sim.state.members.boss).toMatchObject({
      conflict: true,
      pendingMerges: ['mid'],
      unreadReports: 1,
    });
    expect(sim.lastMessage('boss')).toContain('conflicts in: a.txt');
    expect(sim.lastMessage('boss')).not.toContain('[Report from Mid');
    sim.finish('boss', { text: 'fixed' });
    sim.send({ type: 'MergeFinished', catId: 'boss', blocked: ['a.txt'], results: [] });
    expect(sim.lastMessage('boss')).toContain('still has an unfinished merge (a.txt)');
  });

  it('A13: a failed commit sends a failure report', () => {
    const sim = delegated({ repo: true, manual: ['CommitWorktree'] });
    sim.tool('w1', 'report', { result: 'did it' });
    sim.finish('w1');
    sim.send({ type: 'CommitFinished', assignmentId: 'a1', ok: false, error: 'disk full' });
    expect(states(sim)).toEqual(['failed']);
    expect(sim.lastMessage('boss')).toContain(
      '[Failure report from W1 (w1)]\ndid it\n[Office] Could not commit the work: disk full',
    );
  });

  it('A14, A15: one retry after an infrastructure failure, then a failure report', () => {
    const sim = delegated();
    sim.tool('w1', 'report', { result: 'half' });
    sim.finish('w1', { ok: false, error: 'exit 1' });
    expect(sim.timers.get('retry:w1')).toBe(TURN_RETRY_DELAY_MS);
    expect(sim.state.members.w1).toMatchObject({ retries: 1, outgoingReport: undefined });
    expect(sim.state.members.w1.inbox[0]).toContain('[Task from Boss');
    sim.fire('retry:w1');
    expect(sim.running()).toContain('w1');
    sim.finish('w1', { ok: false, error: 'exit 1 again' });
    expect(states(sim)).toEqual(['failed']);
    expect(sim.lastMessage('boss')).toContain(
      '[Failure report from W1 (w1)]\nThe turn failed: exit 1 again',
    );
  });

  it('A15, R8: a timeout kills the turn and fails without a retry', () => {
    const sim = delegated();
    const turnId = sim.state.members.w1.turnId;
    expect(sim.timers.get(`turn:${turnId}`)).toBe(TURN_TIMEOUT_MS);
    sim.fire(`turn:${turnId}`);
    expect(sim.effects.at(-1)).toBeDefined();
    expect(states(sim)).toEqual(['failed']);
    expect(sim.timers.has('retry:w1')).toBe(false);
    expect(sim.lastMessage('boss')).toContain('ran longer than 30 minutes');
  });

  it('A17, A18: cancel cancels open assignments; a restart keeps them', () => {
    const sim = delegated({}, ['w1', 'mid']);
    sim.tool('w1', 'report', { result: 'r' });
    sim.finish('w1');
    sim.send({ type: 'ServerRestarted' });
    expect(states(sim)).toEqual(['reported', 'working']);
    sim.send({ type: 'CancelRequested' });
    expect(states(sim)).toEqual(['reported', 'cancelled']);
  });

  it('I7: an ask without a reply gets the last text; a failed turn answers with the error', () => {
    const sim = delegated({}, ['w1', 'mid']);
    sim.tool('w1', 'ask', { to: 'mid', question: 'q1' });
    sim.finish('w1', { text: 'asked' });
    sim.finish('mid', { text: 'first' }); // this turn did not read q1
    sim.finish('mid', { text: 'my thoughts' }); // read q1, no reply tool
    const replies = () => sim.messages.filter((m) => m.kind === 'reply');
    expect(replies()).toEqual([
      { type: 'Message', from: 'mid', to: 'w1', kind: 'reply', text: 'my thoughts' },
    ]);
    expect(sim.state.members.w1.waitingOn).toEqual([]);
    sim.tool('w1', 'ask', { to: 'mid', question: 'q2' });
    sim.finish('mid', { text: 'nudge turn' });
    sim.state.members.mid.retries = 1; // no retry left
    sim.finish('mid', { ok: false, error: 'boom' });
    expect(replies().at(-1)?.text).toBe('My turn failed: boom');
  });
});

describe('review fixes', () => {
  it('refuses a delegate after a report in the same turn (I3)', () => {
    const sim = delegated({}, ['mid']);
    sim.tool('mid', 'report', { result: 'done' });
    expect(sim.tool('mid', 'delegate', { to: 'deep', task: 'x' }).text).toContain(
      'already reported',
    );
  });

  it('refuses new work for a cat whose report is still unread (A16)', () => {
    const sim = delegated({ repo: true, manual: ['MergeBranches'] });
    sim.tool('w1', 'report', { result: 'r1' });
    sim.finish('w1');
    expect(sim.state.members.boss.pendingReports.w1).toContain('r1');
    expect(sim.tool('boss', 'delegate', { to: 'w1', task: 'again' }).text).toContain(
      'reaches you in your next turn',
    );
  });
});

describe('turn region', () => {
  it('R1, R2, R5: an inbox message queues a turn; the grant prepares the worktree and spawns', () => {
    const sim = delegated({ repo: true });
    const spawn = sim.spawned.find((s) => s.catId === 'w1')!;
    expect(spawn).toMatchObject({
      cwd: '/wt/w1',
      resume: false,
      sessionId: sim.state.members.w1.sessionId,
    });
    expect(sim.effects.some((e) => e.type === 'PrepareWorkspace' && e.catId === 'w1')).toBe(true);
    sim.finish('w1', { text: 'x' }); // nudge turn resumes the session
    expect(sim.spawned.filter((s) => s.catId === 'w1').at(-1)).toMatchObject({ resume: true });
  });

  it('R3, R4: the user holds the wheel -> lock_wait, retry every 5 s', () => {
    const sim = new Sim({ manual: ['RequestTurn'] });
    sim.held.length = 0;
    sim.tool('boss', 'delegate', { to: 'w1', task: 'job' });
    sim.lockBusy.add('w1');
    sim.send({ type: 'TurnLockBusy', catId: 'w1' });
    expect(sim.state.members.w1.turn).toBe('lock_wait');
    expect(sim.timers.get('lock:w1')).toBe(SESSION_LOCK_RETRY_MS);
    sim.fire('lock:w1');
    expect(sim.state.members.w1.turn).toBe('queued');
  });

  it('R9: a restart during preparing goes idle and releases the slot', () => {
    const sim = new Sim({ manual: ['PrepareWorkspace'], repo: true });
    sim.tool('boss', 'delegate', { to: 'w1', task: 'job' });
    expect(sim.state.members.w1.turn).toBe('preparing');
    sim.send({ type: 'ServerRestarted' });
    expect(sim.state.members.w1.turn).toBe('idle');
    expect(sim.effects.at(-1)).toBeDefined();
    expect(sim.effects.some((e) => e.type === 'ReleaseTurn' && e.catId === 'w1')).toBe(true);
  });

  it('a stale grant (task stopped) gives the slot back at once', () => {
    const sim = new Sim({ manual: ['RequestTurn'] });
    sim.held.length = 0;
    sim.tool('boss', 'delegate', { to: 'w1', task: 'job' });
    sim.send({ type: 'CancelRequested' });
    sim.send({ type: 'TurnGranted', catId: 'w1', turnId: 'late' });
    expect(sim.effects.at(-1)).toEqual({ type: 'ReleaseTurn', catId: 'w1' });
    expect(sim.spawned.some((s) => s.catId === 'w1')).toBe(false); // I9
  });
});
