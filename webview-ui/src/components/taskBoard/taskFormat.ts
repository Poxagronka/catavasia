import type { TaskStatus, TaskTarget } from '../../../../core/src/tasks.js';
import { CAT_NAMES } from '../../constants.js';

export function catName(palette: number | undefined): string {
  return palette === undefined ? 'Cat' : CAT_NAMES[palette % CAT_NAMES.length];
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

export const STATUS_CLASS: Record<TaskStatus, string> = {
  running: 'text-status-active',
  done: 'text-status-success',
  error: 'text-status-error',
};

/** A new task goes to the team (its boss delegates down the hierarchy) when there are cats. */
export function defaultTarget(targets: TaskTarget[]): string {
  return targets.some((t) => t.id === 'team' && !t.disabled) ? 'team' : '';
}
