import type { TaskStatus, TaskSummary, TaskTarget } from '../../../../core/src/tasks.js';
import { CAT_NAMES } from '../../constants.js';

export function catName(palette: number | undefined): string {
  return palette === undefined ? 'Cat' : CAT_NAMES[palette % CAT_NAMES.length];
}

/**
 * Who runs the task, for the card and the detail "Cat" row: the profile name
 * of a cat task, "Team · <boss>" for a team task, else the breed name.
 */
export function taskCatLabel(
  task: Pick<TaskSummary, 'palette' | 'target' | 'flow'>,
  cats: ReadonlyArray<{ id: string; name: string }>,
): string {
  const nameOf = (id: string | undefined) => cats.find((c) => c.id === id)?.name;
  if (task.target === 'team') {
    const boss = nameOf(task.flow?.root);
    return boss ? `Team · ${boss}` : 'Team';
  }
  return nameOf(task.target) ?? catName(task.palette);
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

/** The Cat CEO review badge of a task card: short text and its hover text. */
export function reviewBadge(review: TaskSummary['review']): { text: string; title: string } | null {
  if (!review) return null;
  if (review.state === 'pending')
    return { text: 'CEO: queued', title: 'The Cat CEO reviews it soon' };
  if (review.state === 'reviewing') {
    return { text: 'CEO: reviewing…', title: 'The Cat CEO reviews it now' };
  }
  if (review.state === 'failed') return { text: 'CEO: no review', title: review.error ?? '' };
  const range =
    review.minScore === undefined
      ? ''
      : review.minScore === review.maxScore
        ? `${review.minScore} `
        : `${review.minScore}–${review.maxScore} `;
  const cost = review.costUsd === undefined ? '' : ` ($${review.costUsd.toFixed(2)})`;
  return { text: `CEO: ${range}${review.verdict ?? ''}`, title: `${review.summary ?? ''}${cost}` };
}
