import type { BackgroundTask, TodoItem } from '../../../core/src/catSession.js';
import { Button } from '../components/ui/Button.js';

/** The CLI's marks of a to-do item. */
const TODO_MARK: Record<TodoItem['status'], string> = {
  pending: '☐',
  in_progress: '◼',
  completed: '☒',
};

/** Claude Code's background task types in plain words. */
const TASK_KIND: Record<string, string> = {
  local_bash: 'Command',
  local_agent: 'Helper',
};

/**
 * The CEO's to-do list as the CLI shows it: a mark per item, the item in
 * progress in its own words ("Running tests"), done items struck through.
 */
export function TodoChecklist({ todos }: { todos: TodoItem[] }) {
  return (
    <ul
      className="m-0 p-0 list-none flex flex-col gap-2 prose-body prose-small"
      data-testid="dock-todos"
    >
      {todos.map((t, n) => (
        <li
          key={t.id ? `id:${t.id}` : `n:${n}`}
          className={`flex gap-6 break-words ${
            t.status === 'completed'
              ? 'text-text-muted line-through'
              : t.status === 'in_progress'
                ? 'text-status-active'
                : ''
          }`}
          data-testid="dock-todo"
          data-status={t.status}
        >
          <span className="shrink-0">{TODO_MARK[t.status]}</span>
          <span>{t.status === 'in_progress' ? (t.activeForm ?? t.content) : t.content}</span>
        </li>
      ))}
    </ul>
  );
}

/** The session's background tasks, one line each with its own Stop (the turn goes on). */
export function BackgroundTasks({
  tasks,
  onStop,
}: {
  tasks: BackgroundTask[];
  onStop: (id: string) => void;
}) {
  return (
    <ul
      className="m-0 p-0 list-none flex flex-col gap-2 prose-body prose-small"
      data-testid="dock-tasks"
    >
      {tasks.map((t) => (
        <li key={t.id} className="flex items-center gap-6 min-w-0" data-testid="dock-task">
          <span className="shrink-0 text-text-muted">{TASK_KIND[t.type] ?? 'Task'}:</span>
          <span className="truncate flex-1" title={t.description}>
            {t.description}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onStop(t.id)}
            title="Stop this background task"
            data-testid="dock-task-stop"
          >
            Stop
          </Button>
        </li>
      ))}
    </ul>
  );
}
