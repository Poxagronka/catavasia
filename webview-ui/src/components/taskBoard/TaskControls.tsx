import { useState } from 'react';

import type { TaskSummary } from '../../../../core/src/tasks.js';
import { Button } from '../ui/Button.js';
import { type TaskAction, taskActions } from './taskActions.js';
import { sessionToken, taskAction } from './taskApi.js';

const LABEL: Record<TaskAction, string> = { resume: 'Resume', cancel: 'Cancel task' };

/** Resume / Cancel of a team task (token-gated on the server). */
export function TaskControls({
  task,
  onChanged,
}: {
  task: TaskSummary;
  onChanged: (task: TaskSummary) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actions = taskActions(task, sessionToken !== null);
  if (actions.length === 0) return null;
  const run = async (action: TaskAction) => {
    setBusy(true);
    setError(null);
    try {
      onChanged(await taskAction(task.id, action));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex gap-8 items-center">
      {actions.map((action) => (
        <Button
          key={action}
          size="md"
          variant={busy ? 'disabled' : action === 'resume' ? 'accent' : 'default'}
          disabled={busy}
          onClick={() => void run(action)}
        >
          {LABEL[action]}
        </Button>
      ))}
      {error && <span className="text-xs text-status-error">{error}</span>}
    </div>
  );
}
