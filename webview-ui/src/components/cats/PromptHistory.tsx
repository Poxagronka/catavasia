import { useEffect, useState } from 'react';

import type { PromptHistoryEntry } from '../../../../core/src/messages.js';
import { catCeo, useCatCeo } from '../../cats/catCeoClient.js';
import { CAT_CEO_ID } from '../../constants.js';
import { Button } from '../ui/Button.js';
import { LastTidy, TidyTable } from './TidyTable.js';

const AUTHOR: Record<PromptHistoryEntry['author'], string> = {
  'cat-ceo': 'Cat CEO',
  user: 'You',
  guard: 'Guard',
};

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

function score(e: PromptHistoryEntry): string | null {
  if (e.scoreBefore === undefined && e.scoreAfter === undefined) return null;
  return `score ${e.scoreBefore ?? '–'} → ${e.scoreAfter ?? '–'}`;
}

/** Revert / Restore of one commit, each with an inline confirm (webviews block window.confirm). */
function EntryActions({ catId, entry }: { catId: string; entry: PromptHistoryEntry }) {
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
          {confirm === 'revert' ? 'Revert this change?' : 'Restore this version?'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
          Cancel
        </Button>
      </div>
    );
  }
  return (
    <div className="flex gap-4">
      <Button
        size="sm"
        onClick={() => setConfirm('revert')}
        title="Undo this commit as a new commit"
      >
        Revert this change
      </Button>
      <Button
        size="sm"
        onClick={() => setConfirm('restore')}
        title="Make the prompt file this version again"
      >
        Restore this version
      </Button>
    </div>
  );
}

/** "Tidy now" (the Cat CEO re-checks the Rules and Lessons), its state, and the newest tidy. */
function TidyBar({ catId }: { catId: string }) {
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
          title="The Cat CEO merges, rewrites or removes Rules and Lessons items (one commit)"
        >
          Tidy now
        </Button>
        {state && <span className="text-text-muted">{state.text}</span>}
      </div>
      {last && <LastTidy tidy={last} />}
    </>
  );
}

/** Prompt history of one cat: commits newest first, the diff of the open one, revert and restore. */
export function PromptHistory({ catId }: { catId: string }) {
  const { history, diffs } = useCatCeo();
  const entries = history[catId];
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    catCeo.requestHistory(catId);
  }, [catId]);
  useEffect(() => {
    if (open && diffs[`${catId}:${open}`] === undefined) catCeo.requestDiff(catId, open);
  }, [catId, open, diffs]);

  if (!entries) return <div className="text-xs text-text-muted">Loading the history…</div>;
  if (!entries.length) return <div className="text-xs text-text-muted">No commits yet.</div>;
  return (
    <div className="flex flex-col gap-2 text-xs" data-testid="prompt-history">
      <TidyBar catId={catId} />
      {entries.map((e) => {
        const isOpen = open === e.sha;
        const diff = diffs[`${catId}:${e.sha}`];
        const s = score(e);
        return (
          <div key={e.sha} className="flex flex-col gap-4 border-2 border-border p-4">
            <button
              className="flex flex-wrap gap-x-8 gap-y-2 items-baseline text-left cursor-pointer bg-transparent border-0 p-0 text-text"
              onClick={() => setOpen(isOpen ? null : e.sha)}
            >
              <span className="text-text-muted">{new Date(e.at).toLocaleString()}</span>
              <span className={e.author === 'cat-ceo' ? 'text-status-permission' : 'text-text'}>
                {AUTHOR[e.author]}
              </span>
              <span className="break-words min-w-0">{e.subject}</span>
              {e.taskId && <span className="text-text-muted">task {e.taskId}</span>}
              {s && <span className="text-text-muted">{s}</span>}
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
                    <span className="text-text-muted">Loading the diff…</span>
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
