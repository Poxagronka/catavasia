import { useEffect, useRef, useState } from 'react';

import type { CeoChatSummary } from '../../../core/src/ceoDesk.js';
import { CEO_CHAT_TITLE_MAX } from '../../../core/src/ceoDesk.js';
import { relativeTime } from '../catTerminal/consoleState.js';
import { ceoDeskApi } from './ceoDeskApi.js';
import { groupChats, NEW_CHAT_TITLE } from './chatHistoryState.js';

interface ChatHistoryMenuProps {
  /** The open chat (the server status); absent until the dock connects. */
  chat?: { id: string; title: string };
  /** The CEO is answering: opening another chat stops it, so the menu asks first. */
  busy: boolean;
}

/** What a row shows instead of its title line: a name box or a question. */
type RowMode = { id: string; kind: 'rename' | 'delete' | 'open' } | null;

function DownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.5 6L8 10.5L12.5 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M10.5 2.5l3 3L6 13H3v-3l7.5-7.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.7 9h6.6l.7-9"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The chat title in the dock header, like the Claude app: a click opens the
 * chat history under it (search, chats by day, the open one marked). A click
 * on a chat opens it; each row can be renamed or deleted (after a question).
 */
export function ChatHistoryMenu({ chat, busy }: ChatHistoryMenuProps) {
  const [open, setOpen] = useState(false);
  const [chats, setChats] = useState<CeoChatSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<RowMode>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  /** When the menu opened: the groups and times count from it. */
  const [now, setNow] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const title = chat?.title || NEW_CHAT_TITLE;

  const reload = () =>
    ceoDeskApi.chats().then(
      (r) => setChats(r.chats),
      (err: Error) => setError(err.message),
    );
  const close = () => {
    setOpen(false);
    setMode(null);
    setQuery('');
    trigger.current?.focus();
  };
  const run = (job: Promise<unknown>, after: () => void) =>
    void job.then(after, (err: Error) => setError(err.message));

  useEffect(() => {
    if (!open) return;
    setError('');
    void reload();
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
    // The list reloads when the menu opens and after each change, not on every render.
  }, [open]);

  const openChat = (id: string) => {
    if (id === chat?.id) return close();
    if (busy && mode?.kind !== 'open') return setMode({ id, kind: 'open' });
    run(ceoDeskApi.openChat(id), close);
  };
  const saveName = (id: string) => {
    const next = name.trim();
    if (!next) return setMode(null);
    run(ceoDeskApi.renameChat(id, next), () => {
      setMode(null);
      void reload();
    });
  };
  const remove = (id: string) =>
    run(ceoDeskApi.deleteChat(id), () => {
      setMode(null);
      void reload();
    });

  const groups = chats ? groupChats(chats, now, query) : [];
  const confirm = (text: string, yes: string, onYes: () => void, testId: string) => (
    <div className="flex flex-col gap-8 px-10 py-8" data-testid={testId}>
      <span className="prose-body text-text-body">{text}</span>
      <span className="flex gap-8">
        <button type="button" className="dock-ctl bg-btn-bg" onClick={onYes}>
          {yes}
        </button>
        <button type="button" className="dock-ctl" onClick={() => setMode(null)}>
          Cancel
        </button>
      </span>
    </div>
  );

  const row = (c: CeoChatSummary) => {
    const current = c.id === chat?.id;
    if (mode?.id === c.id && mode.kind === 'delete')
      return confirm(
        `Delete "${c.title}"? Its messages and files go away for good.`,
        'Delete',
        () => remove(c.id),
        'chat-delete-confirm',
      );
    if (mode?.id === c.id && mode.kind === 'open')
      return confirm(
        `The CEO is still answering in this chat. Stop the answer and open "${c.title}"?`,
        'Stop and open',
        () => run(ceoDeskApi.openChat(c.id), close),
        'chat-open-confirm',
      );
    if (mode?.id === c.id && mode.kind === 'rename')
      return (
        <input
          autoFocus
          value={name}
          maxLength={CEO_CHAT_TITLE_MAX}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveName(c.id);
            if (e.key === 'Escape') {
              e.stopPropagation();
              setMode(null);
            }
          }}
          onBlur={() => setMode(null)}
          aria-label="Chat name"
          className="w-full h-28 bg-bg border-2 border-border focus:border-accent outline-none px-8 rounded-[6px] prose-body"
          data-testid="chat-rename-input"
        />
      );
    return (
      <div className={`chat-row group ${current ? 'is-current' : ''}`}>
        <button
          type="button"
          className="flex-1 min-w-0 flex items-center gap-8 h-28 px-10 text-left cursor-pointer"
          aria-current={current || undefined}
          onClick={() => openChat(c.id)}
          title={c.title}
          data-testid="chat-row"
        >
          <span className="flex-1 truncate composer-choice-label">{c.title}</span>
          <span className="shrink-0 composer-choice-hint group-hover:hidden group-focus-within:hidden">
            {current ? 'Open now' : relativeTime(c.updatedAt, now)}
          </span>
        </button>
        <span className="hidden group-hover:flex group-focus-within:flex shrink-0">
          <button
            type="button"
            className="dock-ctl is-icon"
            title="Rename"
            aria-label={`Rename ${c.title}`}
            onClick={() => {
              setName(c.title);
              setMode({ id: c.id, kind: 'rename' });
            }}
            data-testid="chat-rename"
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            className="dock-ctl is-icon"
            title="Delete"
            aria-label={`Delete ${c.title}`}
            onClick={() => setMode({ id: c.id, kind: 'delete' })}
            data-testid="chat-delete"
          >
            <TrashIcon />
          </button>
        </span>
      </div>
    );
  };

  return (
    <div ref={box} className="min-w-0 flex">
      <button
        ref={trigger}
        type="button"
        className="dock-ctl chat-title"
        aria-expanded={open}
        title="Chat history"
        onClick={() => {
          if (open) return close();
          setNow(Date.now());
          setOpen(true);
        }}
        data-testid="dock-chat-title"
      >
        <span className="truncate">{title}</span>
        <DownIcon />
      </button>
      {open && (
        <div
          className="chat-menu"
          role="dialog"
          aria-label="Chat history"
          data-testid="chat-history"
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="w-full h-28 bg-bg border-2 border-border focus:border-accent outline-none px-8 rounded-[6px] prose-body"
            data-testid="chat-search"
          />
          {error && <span className="composer-note text-status-error">{error}</span>}
          <div className="flex-1 min-h-0 overflow-y-auto pixel-scrollbar flex flex-col">
            {chats && groups.length === 0 && (
              <span className="composer-note" data-testid="chat-history-empty">
                {query.trim() ? 'No chats match.' : 'No chats yet. Your chats show here.'}
              </span>
            )}
            {groups.map((g) => (
              <div key={g.label} className="flex flex-col gap-2" data-testid="chat-group">
                <span className="chat-group-label">{g.label}</span>
                {g.chats.map((c) => (
                  <div key={c.id}>{row(c)}</div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
