import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

import type { CatSessionEntry } from '../../../core/src/catSession.js';
import { EDIT_RIGHTS_HINT } from '../../../core/src/constants.js';
import { JobCard, type JobCardActions } from '../ceoDesk/JobCard.js';
import { Markdown } from '../components/taskBoard/Markdown.js';
import { Button } from '../components/ui/Button.js';
import { sessionToken } from '../sessionToken.js';
import { type CatConsoleState, type ConsoleRow, type ToolEntry, toRows } from './consoleState.js';

function ToolRow({ tools }: { tools: ToolEntry[] }) {
  const names = [...new Set(tools.map((t) => t.name))].join(', ');
  const label = tools.length === 1 ? '1 tool call' : `${tools.length} tool calls`;
  return (
    <details className="self-start max-w-full text-xs border-l-2 border-status-active pl-6">
      <summary className="cursor-pointer text-text-muted truncate">
        <span className="text-status-active">{label}</span>{' '}
        <span className="prose-code">{names}</span>
      </summary>
      <div className="prose-code flex flex-col gap-2 mt-4 text-text-muted">
        {tools.map((t, n) => (
          <div key={n} className="break-all">
            <span className="text-status-active">{t.name} </span>
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

/** A desk tool row: one readable line ("Started job a1b2 → Team (Oliver)"). */
function ActionRow({ tool }: { tool: ToolEntry }) {
  return (
    <div
      className="self-start max-w-full prose-body prose-small text-text-muted border-l-2 border-status-active pl-8 break-words"
      title={tool.name}
      data-testid="desk-action"
    >
      {tool.text}
    </div>
  );
}

export function MessageRow({
  entry,
  onOpenPromptHistory,
  job,
}: {
  entry: Exclude<CatSessionEntry, ToolEntry>;
  onOpenPromptHistory?: (catId: string) => void;
  /** Job card actions (CEO desk); without them a job row is its one-line text. */
  job?: JobCardActions;
}) {
  if (entry.kind === 'job') {
    if (job) return <JobCard job={entry.job} actions={job} />;
    return <div className="self-start prose-code text-text-muted break-words">{entry.text}</div>;
  }
  if (entry.kind === 'edits') {
    return (
      <div
        className="self-start max-w-[92%] border-2 border-status-active px-8 py-4 text-xs flex flex-col gap-4"
        data-testid="cat-console-edits"
      >
        <span className="prose-body prose-small whitespace-pre-wrap break-words">{entry.text}</span>
        {onOpenPromptHistory && entry.catIds.length > 0 && (
          <div className="flex flex-wrap gap-4">
            {entry.catIds.map((catId) => (
              <Button key={catId} size="sm" onClick={() => onOpenPromptHistory(catId)}>
                Prompt history: {catId}
              </Button>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (entry.kind === 'user') {
    return (
      <div className="self-end max-w-[85%] prose-measure bg-active-bg border-2 border-accent px-10 py-6 shadow-pixel prose-body whitespace-pre-wrap break-words">
        {entry.text}
      </div>
    );
  }
  if (entry.kind === 'error') {
    return (
      <div className="self-start max-w-[92%] prose-measure border-2 border-danger px-10 py-6 prose-body prose-small text-status-error whitespace-pre-wrap break-words">
        {entry.text}
      </div>
    );
  }
  return (
    <div className="self-start max-w-[92%] prose-measure bg-btn-bg border-2 border-border px-12 py-8 shadow-pixel break-words">
      <Markdown text={entry.text} />
    </div>
  );
}

/** One console row: a message, a folded run of tool calls, or a desk action. */
export function ConsoleRowView({
  row,
  onOpenPromptHistory,
  job,
}: {
  row: ConsoleRow;
  onOpenPromptHistory?: (catId: string) => void;
  job?: JobCardActions;
}) {
  if (row.kind === 'tools') return <ToolRow tools={row.tools} />;
  if (row.kind === 'action') return <ActionRow tool={row.tool} />;
  return <MessageRow entry={row.entry} onOpenPromptHistory={onOpenPromptHistory} job={job} />;
}

interface ChatConsoleProps {
  state: CatConsoleState;
  onSend: (text: string) => Promise<void>;
  /** Open the Prompt history of a cat (the link of a prompt edit row). */
  onOpenPromptHistory?: (catId: string) => void;
}

/** The default view of a cat: its session as a pixel chat, and a message box. */
export function ChatConsole({ state, onSend, onOpenPromptHistory }: ChatConsoleProps) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { busy, wheelHeld, busyText } = state.status;

  // Keep the newest row in view as the session streams.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.entries.length, busy]);

  const blocked = !sessionToken
    ? EDIT_RIGHTS_HINT
    : wheelHeld
      ? 'You hold the wheel: type in the Terminal tab.'
      : null;
  const canSend = !blocked && !busy && !sending && draft.trim() !== '';

  const submit = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      await onSend(draft.trim());
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div
        ref={listRef}
        className="flex-1 min-h-0 overflow-y-auto pixel-scrollbar flex flex-col gap-8 p-10"
        data-testid="cat-console-log"
      >
        {!state.loaded && <span className="text-text-muted text-sm">Connecting...</span>}
        {toRows(state.entries).map((row, n) => (
          <ConsoleRowView key={n} row={row} onOpenPromptHistory={onOpenPromptHistory} />
        ))}
        {busy && (
          <span className="self-start text-status-active text-sm pixel-pulse">
            {busyText ?? 'The cat is working...'}
          </span>
        )}
      </div>
      <div className="border-t-2 border-border p-8 flex flex-col gap-4">
        {(blocked || error) && (
          <span className={`text-xs ${error ? 'text-status-error' : 'text-text-muted'}`}>
            {error ?? blocked}
          </span>
        )}
        <div className="flex gap-6 items-end">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={!!blocked}
            rows={2}
            placeholder={busy ? 'Wait for the turn to end...' : 'Message the cat (Enter sends)'}
            className="flex-1 resize-none bg-bg-dark border-2 border-border focus:border-accent outline-none px-8 py-6 prose-body"
            data-testid="cat-console-input"
          />
          <Button
            variant={canSend ? 'accent' : 'disabled'}
            size="md"
            disabled={!canSend}
            onClick={() => void submit()}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
