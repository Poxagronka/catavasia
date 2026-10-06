import type { TaskSummary } from '../../../../core/src/tasks.js';

export type TaskAction = 'resume' | 'cancel';

/**
 * The state-machine buttons a team task offers (task-state-machine.md T12,
 * T14, T15): Resume and Cancel for an interrupted task, Cancel while it runs.
 * Both need the server token, like creating a task.
 */
export function taskActions(
  task: Pick<TaskSummary, 'target' | 'status' | 'flow'>,
  hasToken: boolean,
): TaskAction[] {
  if (!hasToken || !task.target || !task.flow) return [];
  if (task.flow.state === 'interrupted') return ['resume', 'cancel'];
  if (task.status === 'running' && task.flow.state !== 'merging') return ['cancel'];
  return [];
}
