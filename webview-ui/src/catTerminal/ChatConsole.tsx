import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

import type { CatSessionEntry } from '../../../core/src/catSession.js';
import { Markdown } from '../components/taskBoard/Markdown.js';
import { sessionToken } from '../components/taskBoard/taskApi.js';
import { Button } from '../components/ui/Button.js';
import { type CatConsoleState, toRows } from './consoleState.js';

type ToolEntry = Extract<CatSessionEntry, { kind: 'tool' }>;

function ToolRow({ tools }: { tools: ToolEntry[] }) {
  const names = [...new Set(tools.map((t) => t.name))].join(', ');
  const label = tools.length === 1 ? '1 tool call' : `${tools.length} tool calls`;
  return (
    <details className="self-start max-w-full text-xs border-l-2 border-status-active pl-6">
      <summary className="cursor-pointer text-text-muted truncate">
        <span className="text-status-active">{label}</span> {names}
      </summary>
      <div className="flex flex-col gap-2 mt-4">
        {tools.map((t, n) => (
          <div key={n} className="break-all">
            <span className="text-status-active">{t.name} </span>
            <span className="text-text-muted">{t.text}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

function MessageRow({ entry }: { entry: Exclude<CatSessionEntry, ToolEntry> }) {
  if (entry.kind === 'user') {
    return (
      <div className="self-end max-w-[85%] bg-active-bg border-2 border-accent px-8 py-4 shadow-pixel whitespace-pre-wrap break-words text-sm">
        {entry.text}
      </div>
    );
  }
  if (entry.kind === 'error') {
    return (
      <div className="self-start max-w-[92%] border-2 border-danger px-8 py-4 text-status-error text-xs whitespace-pre-wrap break-all">
        {entry.text}
      </div>
    );
  }
  return (
    <div className="self-start max-w-[92%] bg-btn-bg border-2 border-border px-8 py-4 shadow-pixel text-sm break-words">
      <Markdown text={entry.text} />
    </div>
  );
}

interface ChatConsoleProps {
  state: CatConsoleState;
  onSend: (text: string) => Promise<void>;
}

/** The default view of a cat: its session as a pixel chat, and a message box. */
export function ChatConsole({ state, onSend }: ChatConsoleProps) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { busy, wheelHeld } = state.status;

  // Keep the newest row in view as the session streams.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.entries.length, busy]);

  const blocked = !sessionToken
    ? 'Open the page from the tokened URL the CLI printed to talk to cats.'
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
        {toRows(state.entries).map((row, n) =>
          row.kind === 'tools' ? (
            <ToolRow key={n} tools={row.tools} />
          ) : (
            <MessageRow key={n} entry={row.entry} />
          ),
        )}
        {busy && (
          <span className="self-start text-status-active text-sm pixel-pulse">
            The cat is working...
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
            className="flex-1 resize-none bg-bg-dark border-2 border-border focus:border-accent outline-none px-6 py-4 text-sm text-text font-pixel"
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
