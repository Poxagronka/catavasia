import { useEffect, useState } from 'react';

import type { PromptHistoryEntry } from '../../../../core/src/messages.js';
import { catCeo, useCatCeo } from '../../cats/catCeoClient.js';
import { CAT_CEO_ID } from '../../constants.js';
import { cats } from '../../i18n/cats/en.js';
import { useT } from '../../i18n/useT.js';
import { Button } from '../ui/Button.js';
import { LastTidy, TidyTable } from './TidyTable.js';

const AUTHOR = {
  'cat-ceo': 'authorCatCeo',
  user: 'authorUser',
  guard: 'authorGuard',
} as const satisfies Record<PromptHistoryEntry['author'], string>;

/** One diff line coloured like a unified diff. */
function DiffLine({ line }: { line: string }) {
  const color =
    line.startsWith('+') && !line.startsWith('+++')
      ? 'text-status-success'
      : line.startsWith('-') && !line.startsWith('---')
        ? 'text-status-error'
        : line.startsWith('@@')
          ? 'text-accent-bright'
          : 'text-text-muted';
  return <div className={`${color} whitespace-pre-wrap break-words`}>{line || ' '}</div>;
}

function scoreRange(e: PromptHistoryEntry): { before: string; after: string } | null {
  if (e.scoreBefore === undefined && e.scoreAfter === undefined) return null;
  return { before: String(e.scoreBefore ?? '–'), after: String(e.scoreAfter ?? '–') };
}

/** Revert / Restore of one commit, each with an inline confirm (webviews block window.confirm). */
function EntryActions({ catId, entry }: { catId: string; entry: PromptHistoryEntry }) {
  const t = useT(cats);
  const [confirm, setConfirm] = useState<'revert' | 'restore' | null>(null);
  if (confirm) {
    const run = () => {
      if (confirm === 'revert') catCeo.revert(catId, entry.sha);
      else catCeo.restore(catId, entry.sha);
      setConfirm(null);
    };
    return (
      <div className="flex gap-4 items-center">
        <Button size="sm" variant="accent" onClick={run}>
          {confirm === 'revert' ? t('revertConfirm') : t('restoreConfirm')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
          {t('cancel')}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex gap-4">
      <Button size="sm" onClick={() => setConfirm('revert')} title={t('revertTitle')}>
        {t('revert')}
      </Button>
      <Button size="sm" onClick={() => setConfirm('restore')} title={t('restoreTitle')}>
        {t('restore')}
      </Button>
    </div>
  );
}

/** "Tidy now" (the Cat CEO re-checks the Rules and Lessons), its state, and the newest tidy. */
function TidyBar({ catId }: { catId: string }) {
  const t = useT(cats);
  const { tidy, lastTidy, settings } = useCatCeo();
  const state = tidy[catId];
  const last = lastTidy[catId];
  if (catId === CAT_CEO_ID) return null;
  return (
    <>
      <div className="flex gap-8 items-center">
        <Button
          size="sm"
          disabled={!settings?.enabled || state?.state === 'queued'}
          onClick={() => catCeo.tidyNow(catId)}
          title={t('tidyNowTitle')}
        >
          {t('tidyNow')}
        </Button>
        {state && <span className="text-text-muted">{state.text}</span>}
      </div>
      {last && <LastTidy tidy={last} />}
    </>
  );
}

/** Prompt history of one cat: commits newest first, the diff of the open one, revert and restore. */
export function PromptHistory({ catId }: { catId: string }) {
  const t = useT(cats);
  const { history, diffs } = useCatCeo();
  const entries = history[catId];
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    catCeo.requestHistory(catId);
  }, [catId]);
  useEffect(() => {
    if (open && diffs[`${catId}:${open}`] === undefined) catCeo.requestDiff(catId, open);
  }, [catId, open, diffs]);

  if (!entries) return <div className="text-xs text-text-muted">{t('loadingHistory')}</div>;
  if (!entries.length) return <div className="text-xs text-text-muted">{t('noCommits')}</div>;
  return (
    <div className="flex flex-col gap-2 text-xs" data-testid="prompt-history">
      <TidyBar catId={catId} />
      {entries.map((e) => {
        const isOpen = open === e.sha;
        const diff = diffs[`${catId}:${e.sha}`];
        const range = scoreRange(e);
        return (
          <div key={e.sha} className="flex flex-col gap-4 border-2 border-border p-4">
            <button
              className="flex flex-wrap gap-x-8 gap-y-2 items-baseline text-start cursor-pointer bg-transparent border-0 p-0 text-text"
              onClick={() => setOpen(isOpen ? null : e.sha)}
            >
              <span className="text-text-muted">{new Date(e.at).toLocaleString()}</span>
              <span className={e.author === 'cat-ceo' ? 'text-status-permission' : 'text-text'}>
                {t(AUTHOR[e.author])}
              </span>
              <span className="break-words min-w-0">{e.subject}</span>
              {e.taskId && <span className="text-text-muted">{t('taskId', { id: e.taskId })}</span>}
              {range && <span className="text-text-muted">{t('scoreRange', range)}</span>}
              {e.flag && (
                <span className="px-4 border-2 border-status-error text-status-error">
                  {e.flag}
                </span>
              )}
            </button>
            {isOpen && (
              <>
                {e.tidy && <TidyTable rows={e.tidy} />}
                <div className="bg-bg-dark p-4 font-mono max-h-240 overflow-auto">
                  {diff === undefined ? (
                    <span className="text-text-muted">{t('loadingDiff')}</span>
                  ) : (
                    diff.split('\n').map((line, i) => <DiffLine key={i} line={line} />)
                  )}
                </div>
                <EntryActions catId={catId} entry={e} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
