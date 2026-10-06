import { describe, expect, it } from 'vitest';

import type { FlowState } from '../../core/src/messages.js';
import type { TaskSummary } from '../../core/src/tasks.js';
import { taskActions } from '../src/components/taskBoard/taskActions.js';

const task = (
  status: TaskSummary['status'],
  state?: FlowState,
): Pick<TaskSummary, 'target' | 'status' | 'flow'> => ({
  status,
  target: 'team',
  flow: state ? { root: 'boss', state, nodes: [], turns: 1 } : undefined,
});

describe('task actions (Resume / Cancel)', () => {
  it('offers Resume and Cancel for an interrupted team task, Cancel while it runs', () => {
    expect(taskActions(task('error', 'interrupted'), true)).toEqual(['resume', 'cancel']);
    expect(taskActions(task('running', 'working'), true)).toEqual(['cancel']);
    expect(taskActions(task('running', 'briefing'), true)).toEqual(['cancel']);
  });

  it('offers nothing without the token, for plain runs, finished tasks or while merging', () => {
    expect(taskActions(task('error', 'interrupted'), false)).toEqual([]);
    expect(taskActions({ status: 'running' }, true)).toEqual([]);
    expect(taskActions(task('done', 'done'), true)).toEqual([]);
    expect(taskActions(task('error', 'cancelled'), true)).toEqual([]);
    expect(taskActions(task('running', 'merging'), true)).toEqual([]);
  });
});
