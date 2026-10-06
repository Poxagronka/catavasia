import { useState } from 'react';

import { Button } from '../components/ui/Button.js';
import { updateActions, useUpdate } from './updateStore.js';

const STEP_MARK = { pending: ' ', running: '>', done: 'x', failed: '!' } as const;
/** Log lines shown in the progress panel (the server keeps more). */
const LOG_TAIL_SHOWN = 12;

const panel =
  'absolute top-8 left-1/2 -translate-x-1/2 z-30 pixel-panel py-8 px-12 flex flex-col gap-6 text-sm w-[min(560px,calc(100%-32px))]';

/**
 * Self-update in the game UI: the "new version" offer, the install progress
 * panel, and the "Restarting…" notice. Renders nothing when there is nothing
 * to say (or the server has no update API for this tab).
 */
export function UpdateBanner() {
  const { status, refusal, restarting } = useUpdate();
  const [showNews, setShowNews] = useState(false);
  const [hidden, setHidden] = useState(false);
  if (!status) return null;
  const { run } = status;

  if (restarting) {
    return (
      <div className={panel} data-testid="update-restarting">
        <span className="text-accent-bright">Restarting…</span>
        <span className="text-xs text-text-muted">
          {restarting.timedOut
            ? `The new version did not answer. Start it by hand (catavasia --port ${window.location.port}). Log: ${run.logPath ?? 'see ~/.pixel-agents/update/'}`
            : `Installed ${run.installedVersion ?? status.latestVersion ?? 'the new version'}. The page reloads when it is up.`}
        </span>
      </div>
    );
  }

  if (run.phase === 'running' || (run.phase === 'failed' && !hidden)) {
    return (
      <div className={panel} data-testid="update-progress">
        <div className="flex justify-between items-center gap-8">
          <span className="text-accent-bright">
            {run.phase === 'running'
              ? `Updating to ${status.latestVersion ?? 'the latest version'}…`
              : 'Update failed'}
          </span>
          {run.phase === 'failed' && (
            <Button variant="ghost" size="sm" onClick={() => setHidden(true)}>
              Close
            </Button>
          )}
        </div>
        <ul className="text-xs flex flex-col gap-2">
          {run.steps.map((s) => (
            <li key={s.name} className={s.status === 'pending' ? 'text-text-muted' : ''}>
              [{STEP_MARK[s.status]}] {s.name}
            </li>
          ))}
        </ul>
        {run.error && <span className="text-xs text-status-error">{run.error}</span>}
        {run.phase === 'failed' && (
          <span className="text-xs text-text-muted">
            The current version keeps running. Log: {run.logPath}
          </span>
        )}
        <pre className="text-2xs bg-bg p-4 max-h-[160px] overflow-auto whitespace-pre-wrap break-all">
          {run.log.slice(-LOG_TAIL_SHOWN).join('\n')}
        </pre>
      </div>
    );
  }

  const latest = status.latestVersion;
  if (!status.available || !latest || status.dismissedVersion === latest) return null;
  return (
    <div className={panel} data-testid="update-banner">
      <span>
        New version <span className="text-accent-bright">{latest}</span> is available
      </span>
      <div className="flex gap-6">
        <Button
          variant="accent"
          size="sm"
          onClick={() => {
            setHidden(false);
            void updateActions.start();
          }}
        >
          Update
        </Button>
        <Button size="sm" onClick={() => void updateActions.dismiss(latest)}>
          Later
        </Button>
        <Button size="sm" onClick={() => setShowNews((v) => !v)}>
          What's new
        </Button>
      </div>
      {refusal && <span className="text-xs text-status-error">{refusal}</span>}
      {showNews && <WhatsNew commits={status.commits} compareUrl={status.compareUrl} />}
    </div>
  );
}

function WhatsNew({
  commits,
  compareUrl,
}: {
  commits?: Array<{ sha: string; title: string; url: string }>;
  compareUrl: string;
}) {
  const link = (
    <a href={compareUrl} target="_blank" rel="noreferrer" className="text-accent-bright">
      See the changes on GitHub
    </a>
  );
  if (!commits || commits.length === 0) return <span className="text-xs">{link}</span>;
  return (
    <div className="flex flex-col gap-4 text-xs">
      <ul className="max-h-[200px] overflow-auto flex flex-col gap-2">
        {commits.map((c) => (
          <li key={c.sha}>
            <a href={c.url} target="_blank" rel="noreferrer" className="hover:text-accent-bright">
              {c.title}
            </a>
          </li>
        ))}
      </ul>
      {link}
    </div>
  );
}
