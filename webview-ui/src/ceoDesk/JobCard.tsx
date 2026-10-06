import { useState } from 'react';

import type { JobCard as Job } from '../../../core/src/ceoDesk.js';
import { taskAction } from '../components/taskBoard/taskApi.js';
import { Button } from '../components/ui/Button.js';
import { isLiveJob, jobActions, shortFolder } from './dockState.js';

export interface JobCardActions {
  /** The page has the server token: Cancel and Resume work. */
  canControl: boolean;
  /** Open the job's TaskDetailModal. */
  onDetails(jobId: string): void;
  /** Open a cat's chat (CatTerminalPanel) by its profile id. */
  onOpenCat(catId: string): void;
}

const STATE_CLASS: Record<string, string> = {
  done: 'text-status-success',
  error: 'text-status-error',
  cancelled: 'text-text-muted',
  interrupted: 'text-status-permission',
};

const NODE_CLASS = {
  working: 'text-status-active',
  reported: 'text-status-success',
  failed: 'text-status-error',
} as const;

function CatLink({ id, name, onOpen }: { id: string; name: string; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      className="text-accent-bright underline cursor-pointer bg-transparent border-0 p-0"
      onClick={() => onOpen(id)}
      title={`Open ${name}'s chat`}
    >
      {name}
    </button>
  );
}

/** A job the CEO started: one card, updated in place by the server's `job` frames. */
export function JobCard({ job, actions }: { job: Job; actions: JobCardActions }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buttons = actions.canControl ? jobActions(job) : [];
  const run = async (action: 'resume' | 'cancel') => {
    setBusy(true);
    setError(null);
    try {
      await taskAction(job.jobId, action);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const team = job.target === 'team';
  const facts = [
    `${job.turns} ${job.turns === 1 ? 'turn' : 'turns'}`,
    ...(job.costUsd !== undefined ? [`$${job.costUsd.toFixed(2)}`] : []),
  ];
  return (
    <div
      className="self-stretch pixel-panel bg-bg-dark! px-10 py-8 flex flex-col gap-6"
      data-testid="job-card"
      data-job-id={job.jobId}
    >
      <div className="flex items-center gap-8 text-xs">
        <span className="text-accent-bright">Job {job.jobId}</span>
        <span className="text-text-muted truncate flex-1">
          {team ? `Team: ${job.leadName} leads` : job.leadName}
        </span>
        <span
          className={`${STATE_CLASS[job.state] ?? 'text-status-active'} ${isLiveJob(job) ? 'pixel-pulse' : ''}`}
          data-testid="job-state"
        >
          {job.state}
        </span>
      </div>
      <div className="prose-body prose-small break-words">{job.title}</div>
      <div className="prose-body prose-small text-text-muted flex gap-6 min-w-0">
        <span className="truncate" title={job.folder ?? ''}>
          {shortFolder(job.folder)}
        </span>
        <span className="shrink-0">· {facts.join(' · ')}</span>
      </div>
      {job.branch && <code className="prose-code text-text break-all">{job.branch}</code>}
      {job.nodes.length > 0 && (
        <div className="prose-body prose-small flex flex-col gap-2 border-l-2 border-border pl-8">
          {job.nodes.map((n, i) => (
            <div key={`${n.catId}-${i}`} className="break-words">
              <CatLink id={n.fromId} name={n.fromName} onOpen={actions.onOpenCat} />
              {' → '}
              <CatLink id={n.catId} name={n.catName} onOpen={actions.onOpenCat} />
              <span className="text-text-muted">: “{n.goal}” </span>
              <span className={NODE_CLASS[n.status]}>{n.status}</span>
            </div>
          ))}
        </div>
      )}
      {job.error && (
        <div className="prose-body prose-small text-status-error break-words">{job.error}</div>
      )}
      <div className="flex gap-6 items-center flex-wrap">
        <Button size="sm" onClick={() => actions.onDetails(job.jobId)}>
          Details
        </Button>
        {buttons.map((action) => (
          <Button
            key={action}
            size="sm"
            variant={busy ? 'disabled' : action === 'resume' ? 'accent' : 'default'}
            disabled={busy}
            onClick={() => void run(action)}
            data-testid={`job-${action}`}
          >
            {action === 'resume' ? 'Resume' : 'Cancel'}
          </Button>
        ))}
        {error && <span className="prose-body prose-small text-status-error">{error}</span>}
      </div>
    </div>
  );
}
