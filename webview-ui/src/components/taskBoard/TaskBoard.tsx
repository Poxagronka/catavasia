import { useCallback, useEffect, useState } from 'react';

import type { TaskSummary } from '../../../../core/src/tasks.js';
import { TASK_POLL_INTERVAL_MS } from '../../constants.js';
import { Button } from '../ui/Button.js';
import { CatAvatar } from './CatAvatar.js';
import { NewTaskForm } from './NewTaskForm.js';
import { fetchTasks, sessionToken } from './taskApi.js';
import { TaskDetailModal } from './TaskDetailModal.js';
import { catName, formatElapsed, STATUS_CLASS } from './taskFormat.js';

interface TaskBoardProps {
  isOpen: boolean;
  onClose: () => void;
}

function TaskCard({ task, now, onOpen }: { task: TaskSummary; now: number; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="flex gap-8 items-center w-full text-left p-6 bg-btn-bg hover:bg-btn-hover border-2 border-transparent hover:border-border rounded-none cursor-pointer text-text"
    >
      <CatAvatar palette={task.palette} hueShift={task.hueShift} />
      <div className="flex flex-col min-w-0 flex-1 gap-2">
        <span className="text-sm truncate">{task.title}</span>
        <span className="text-2xs text-text-muted truncate">
          {catName(task.palette)}
          {task.branch ? ` · ${task.branch}` : ''}
        </span>
        <span className="text-xs flex justify-between">
          <span className={STATUS_CLASS[task.status]}>
            {task.status === 'running' ? 'running...' : task.status}
          </span>
          <span className="text-text-muted">
            {formatElapsed((task.finishedAt ?? now) - task.createdAt)}
          </span>
        </span>
      </div>
    </button>
  );
}

/** Right-side board: task cards, the "+" form, and the detail modal. */
export function TaskBoard({ isOpen, onClose }: TaskBoardProps) {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [defaultCwd, setDefaultCwd] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const res = await fetchTasks();
      setTasks(res.tasks);
      setNow(Date.now());
      setDefaultCwd(res.defaultCwd);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void refresh();
    const poll = setInterval(() => void refresh(), TASK_POLL_INTERVAL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [isOpen, refresh]);

  if (!isOpen) return null;

  const canCreate = sessionToken !== null;

  return (
    <>
      <div className="absolute top-10 right-10 bottom-80 z-30 w-[380px] max-w-[calc(100vw-20px)] flex flex-col pixel-panel">
        <div className="flex items-center justify-between py-4 px-10 border-b-2 border-border">
          <span className="text-accent-bright text-2xl">Tasks</span>
          <div className="flex gap-6 items-center">
            <Button
              size="md"
              variant={canCreate ? (isFormOpen ? 'active' : 'accent') : 'disabled'}
              disabled={!canCreate}
              title={
                canCreate
                  ? 'New task'
                  : 'Open the URL with ?token= that pixel-agents printed to create tasks'
              }
              onClick={() => setIsFormOpen((v) => !v)}
            >
              +
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} title="Close">
              x
            </Button>
          </div>
        </div>
        {!canCreate && (
          <div className="text-2xs text-text-muted px-10 py-4">
            View only: open the tokened URL to add tasks.
          </div>
        )}
        {isFormOpen && canCreate && (
          <NewTaskForm
            defaultCwd={defaultCwd}
            onCancel={() => setIsFormOpen(false)}
            onCreated={() => {
              setIsFormOpen(false);
              void refresh();
            }}
          />
        )}
        <div className="flex-1 overflow-y-auto flex flex-col gap-6 p-8">
          {loadError && <div className="text-xs text-status-error">{loadError}</div>}
          {!loadError && tasks.length === 0 && (
            <div className="text-sm text-text-muted text-center mt-20">
              No tasks yet. Press + to give a cat some work.
            </div>
          )}
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} now={now} onOpen={() => setOpenTaskId(task.id)} />
          ))}
        </div>
      </div>
      {openTaskId && <TaskDetailModal taskId={openTaskId} onClose={() => setOpenTaskId(null)} />}
    </>
  );
}
