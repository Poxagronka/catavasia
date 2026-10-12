import { type ReactNode, useEffect, useState } from 'react';

import type { TaskDetail } from '../../../../core/src/tasks.js';
import { useCats } from '../../cats/useCats.js';
import { TASK_POLL_INTERVAL_MS } from '../../constants.js';
import { useMoneyShown } from '../../engines/money.js';
import { terminal } from '../../i18n/terminal/en.js';
import { useT } from '../../i18n/useT.js';
import { Modal } from '../ui/Modal.js';
import { CatAvatar } from './CatAvatar.js';
import { Markdown } from './Markdown.js';
import { fetchTask } from './taskApi.js';
import { TaskControls } from './TaskControls.js';
import { formatElapsed, reviewBadge, STATUS_CLASS, taskCatLabel } from './taskFormat.js';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-accent-bright text-base border-b border-border pb-2">{title}</div>
      {children}
    </div>
  );
}

function diffLineClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'text-text-muted';
  if (line.startsWith('+')) return 'text-status-success';
  if (line.startsWith('-')) return 'text-status-error';
  if (line.startsWith('@@')) return 'text-status-active';
  return 'text-text-muted';
}

function Meta({ task }: { task: TaskDetail }) {
  const { cats } = useCats();
  const showMoney = useMoneyShown();
  const t = useT(terminal);
  const statusText = {
    running: t('statusRunning'),
    done: t('statusDone'),
    error: t('statusError'),
  }[task.status];
  // [id, label, value]: the id marks the Status row for its color.
  const facts: Array<[string, string, string]> = [
    ['status', t('factStatus'), statusText],
    ['cat', t('factCat'), taskCatLabel(task, cats)],
    ['folder', t('factFolder'), task.cwd],
    ['branch', t('factBranch'), task.branch ?? t('branchNone')],
  ];
  if (task.finishedAt !== undefined) {
    facts.push(['elapsed', t('factElapsed'), formatElapsed(task.finishedAt - task.createdAt)]);
  }
  if (showMoney && task.costUsd !== undefined) {
    facts.push(['cost', t('factCost'), `$${task.costUsd.toFixed(4)}`]);
  }
  if (task.durationMs !== undefined) {
    facts.push(['runTime', t('factRunTime'), formatElapsed(task.durationMs)]);
  }
  if (task.numTurns !== undefined) facts.push(['turns', t('factTurns'), String(task.numTurns)]);
  // The Cat CEO judge review (the task board's badge before the CEO desk).
  const review = reviewBadge(task.review, showMoney);
  if (review) {
    facts.push([
      'review',
      t('factReview'),
      review.title ? `${review.text}: ${review.title}` : review.text,
    ]);
  }
  return (
    <div className="flex gap-12 items-start">
      <CatAvatar palette={task.palette} hueShift={task.hueShift} />
      <div className="grid grid-cols-[auto_1fr] gap-x-12 gap-y-2 items-baseline text-xs min-w-0">
        {facts.map(([id, label, value]) => (
          <div key={id} className="contents">
            <span className="text-text-muted">{label}</span>
            <span
              className={`prose-body prose-small break-all ${id === 'status' ? STATUS_CLASS[task.status] : ''}`}
            >
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Full task view: result, changed files, diff and the tool-call log. */
export function TaskDetailModal({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const t = useT(terminal);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = task === null || task.status === 'running';

  useEffect(() => {
    if (!running) return;
    const load = () =>
      fetchTask(taskId).then(setTask, (err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
    void load();
    const poll = setInterval(() => void load(), TASK_POLL_INTERVAL_MS);
    return () => clearInterval(poll);
  }, [taskId, running]);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={
        <span className="block truncate max-w-[calc(min(920px,94vw)-120px)]">
          {task?.title ?? t('taskFallback')}
        </span>
      }
      className="w-[min(920px,94vw)] max-h-[86vh] flex flex-col"
    >
      <div className="overflow-y-auto px-10 pb-10 flex flex-col gap-14 text-sm">
        {error && <div className="text-status-error">{error}</div>}
        {task && (
          <>
            <Meta task={task} />
            <TaskControls task={task} onChanged={(s) => setTask({ ...task, ...s })} />
            <Section title={t('sectionPrompt')}>
              <div className="prose-body prose-measure whitespace-pre-wrap break-words">
                {task.prompt}
              </div>
            </Section>
            {task.error && (
              <Section title={t('sectionError')}>
                <pre className="prose-code whitespace-pre-wrap text-status-error">{task.error}</pre>
              </Section>
            )}
            <Section title={t('sectionResult')}>
              {task.result ? (
                <Markdown text={task.result} className="prose-measure" />
              ) : (
                <span className="prose-body text-text-muted">
                  {task.status === 'running' ? t('stillWorking') : t('noResult')}
                </span>
              )}
            </Section>
            {task.changedFiles && (
              <Section title={t('sectionChangedFiles', { count: task.changedFiles.length })}>
                {task.changedFiles.length === 0 && (
                  <span className="prose-body text-text-muted">{t('noChanges')}</span>
                )}
                {task.changedFiles.map((f) => (
                  <div key={f.path} className="prose-code break-all">
                    <span className="text-accent-bright inline-block w-20">{f.status}</span>
                    {f.path}
                  </div>
                ))}
              </Section>
            )}
            {task.diff && (
              <Section title={task.diffTruncated ? t('sectionDiffTruncated') : t('sectionDiff')}>
                <pre className="prose-code bg-bg-dark border-2 border-border p-6 overflow-x-auto max-h-[420px]">
                  {task.diff.split('\n').map((line, n) => (
                    <div key={n} className={diffLineClass(line)}>
                      {line || ' '}
                    </div>
                  ))}
                </pre>
              </Section>
            )}
            <details>
              <summary className="cursor-pointer text-accent-bright text-base">
                {t('activityLog', { count: task.log.length })}
              </summary>
              <div className="prose-code flex flex-col gap-2 mt-6">
                {task.log.map((entry, n) => (
                  <div key={n} className="break-all">
                    {entry.kind === 'tool' && (
                      <span className="text-status-active">{entry.name} </span>
                    )}
                    {entry.kind === 'user' && (
                      <span className="text-accent-bright">{t('youPrefix')} </span>
                    )}
                    <span
                      className={entry.kind === 'error' ? 'text-status-error' : 'text-text-muted'}
                    >
                      {entry.text}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          </>
        )}
      </div>
    </Modal>
  );
}
