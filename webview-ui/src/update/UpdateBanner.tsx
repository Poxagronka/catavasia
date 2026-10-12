import { useState } from 'react';

import { Button } from '../components/ui/Button.js';
import { chrome } from '../i18n/chrome/en.js';
import { useT } from '../i18n/useT.js';
import { updateActions, useUpdate } from './updateStore.js';

const STEP_MARK = { pending: ' ', running: '>', done: 'x', failed: '!' } as const;
/** Log lines shown in the progress panel (the server keeps more). */
const LOG_TAIL_SHOWN = 12;
/** Stands in for the version inside a translated sentence, so the number can be highlighted. */
const VERSION_MARK = '\u0000';

// Placed by the App's top banner stack (above the engine notice).
const panel = 'pixel-panel py-8 px-12 flex flex-col gap-6 text-sm w-full';

/**
 * Self-update in the game UI: the "new version" offer, the install progress
 * panel, and the "Restarting…" notice. Renders nothing when there is nothing
 * to say (or the server has no update API for this tab).
 */
export function UpdateBanner() {
  const t = useT(chrome);
  const { status, refusal, restarting } = useUpdate();
  const [showNews, setShowNews] = useState(false);
  const [hidden, setHidden] = useState(false);
  if (!status) return null;
  const { run } = status;
  const installed = run.installedVersion ?? status.latestVersion;

  if (restarting) {
    return (
      <div className={panel} data-testid="update-restarting">
        <span className="text-accent-bright">{t('restarting')}</span>
        <span className="text-xs text-text-muted">
          {restarting.timedOut
            ? t('restartTimedOut', {
                port: window.location.port,
                log: run.logPath ?? '~/.pixel-agents/update/',
              })
            : installed
              ? t('restartDone', { version: installed })
              : t('restartDoneUnknown')}
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
              ? status.latestVersion
                ? t('updatingTo', { version: status.latestVersion })
                : t('updatingToLatest')
              : t('updateFailed')}
          </span>
          {run.phase === 'failed' && (
            <Button variant="ghost" size="sm" onClick={() => setHidden(true)}>
              {t('close')}
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
            {t('keepsRunning', { log: run.logPath ?? '' })}
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
        {t('newVersionAvailable', { version: VERSION_MARK })
          .split(VERSION_MARK)
          .flatMap((part, i) => [
            i > 0 && (
              <span key={`v${i}`} className="text-accent-bright">
                {latest}
              </span>
            ),
            part,
          ])}
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
          {t('update')}
        </Button>
        <Button size="sm" onClick={() => updateActions.dismiss(latest).catch(() => {})}>
          {t('later')}
        </Button>
        <Button size="sm" onClick={() => setShowNews((v) => !v)}>
          {t('whatsNew')}
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
  const t = useT(chrome);
  const link = (
    <a href={compareUrl} target="_blank" rel="noreferrer" className="text-accent-bright">
      {t('seeChanges')}
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
