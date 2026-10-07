import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

import type { CatSessionEntry } from '../../../core/src/catSession.js';
import { type CeoAttachment, formatSize } from '../../../core/src/ceoDesk.js';
import { EDIT_RIGHTS_HINT } from '../../../core/src/constants.js';
import { JobCard, type JobCardActions } from '../ceoDesk/JobCard.js';
import { Markdown } from '../components/taskBoard/Markdown.js';
import { Button } from '../components/ui/Button.js';
import { CopyButton } from '../components/ui/CopyButton.js';
import { attachmentHref, sessionToken } from '../sessionToken.js';
import type { ActivityEntry } from './activityWords.js';
import {
  type CatConsoleState,
  type ConsoleRow,
  relativeTime,
  type ToolEntry,
  toRows,
} from './consoleState.js';
import { ImageLightbox } from './ImageLightbox.js';
import { ToolRow } from './ToolActivity.js';

const CLOCK_TICK_MS = 30_000;

/** The time now, re-read every half minute while `on` (the "2 min ago" labels). */
function useNow(on: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!on) return;
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [on]);
  return now;
}

/** Under a reply: copy it, and when it came ("2 min ago"). Shown on hover, always on the last reply. */
function ReplyActions({ text, at, last }: { text: string; at?: number; last?: boolean }) {
  const now = useNow(at !== undefined);
  return (
    <div
      className={`reply-actions flex items-center gap-8 text-text-muted -ml-4 ${last ? 'is-last' : ''}`}
      data-testid="reply-actions"
    >
      <CopyButton text={() => text} title="Copy the reply" testId="reply-copy" />
      {at !== undefined && (
        <span
          className="prose-body prose-small text-text-muted"
          title={new Date(at).toLocaleString()}
        >
          {relativeTime(at, now)}
        </span>
      )}
    </div>
  );
}

/** A desk tool row: one readable line ("Gave the job to Oliver's team"). */
function ActionRow({ tool }: { tool: ToolEntry }) {
  return (
    <div
      className="self-start max-w-full prose-body prose-small text-text-muted break-words"
      title={tool.name}
      data-testid="desk-action"
    >
      {tool.text}
    </div>
  );
}

/** The files of a sent message: thumbnails that open in the lightbox, chips that download the file. */
function SentAttachments({ files }: { files: CeoAttachment[] }) {
  const [open, setOpen] = useState<CeoAttachment | null>(null);
  return (
    <div
      className="self-end flex flex-wrap justify-end gap-6 max-w-[85%]"
      data-testid="sent-attachments"
    >
      {open && (
        <ImageLightbox
          src={attachmentHref(open.url)}
          alt={open.name}
          onClose={() => setOpen(null)}
        />
      )}
      {files.map((f, n) =>
        f.image ? (
          <button
            key={n}
            type="button"
            onClick={() => setOpen(f)}
            title={`${f.name}: click to enlarge`}
            className="p-0 bg-transparent border-0 cursor-zoom-in"
          >
            <img
              src={attachmentHref(f.url)}
              alt={f.name}
              className="max-w-[160px] max-h-[120px] border-2 border-border hover:border-accent rounded-[8px] block"
              data-testid="sent-thumb"
            />
          </button>
        ) : (
          <a
            key={n}
            href={attachmentHref(f.url)}
            download={f.name}
            className="flex items-center gap-4 max-w-[220px] h-28 px-6 border-2 border-accent bg-active-bg text-xs no-underline"
            data-testid="sent-chip"
          >
            <span className="truncate">{f.name}</span>
            <span className="shrink-0 text-text-muted">{formatSize(f.size)}</span>
          </a>
        ),
      )}
    </div>
  );
}

export function MessageRow({
  entry,
  replyEnd,
  lastReply,
  onOpenPromptHistory,
  job,
  onLogin,
}: {
  entry: Exclude<CatSessionEntry, ActivityEntry>;
  /** The last text of a reply: copy and time show under it (on hover). */
  replyEnd?: boolean;
  /** The newest reply of the chat: its copy and time always show. */
  lastReply?: boolean;
  onOpenPromptHistory?: (catId: string) => void;
  /** Job card actions (CEO desk); without them a job row is its one-line text. */
  job?: JobCardActions;
  /** Opens the engine login: an auth error row offers it (CEO desk). */
  onLogin?: () => void;
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
    const bubble = entry.text && (
      <div className="self-end max-w-[85%] prose-measure bg-btn-bg border-2 border-border rounded-[12px] px-12 py-6 prose-body whitespace-pre-wrap break-words">
        {entry.text}
      </div>
    );
    if (!entry.attachments?.length) return bubble;
    return (
      <div className="self-end flex flex-col items-end gap-4 max-w-full">
        <SentAttachments files={entry.attachments} />
        {bubble}
      </div>
    );
  }
  if (entry.kind === 'error') {
    return (
      <div className="self-start max-w-[92%] prose-measure border-2 border-danger px-10 py-6 flex flex-col items-start gap-6">
        <span className="prose-body prose-small text-status-error whitespace-pre-wrap break-words">
          {entry.text}
        </span>
        {entry.login && onLogin && (
          <Button variant="accent" size="sm" onClick={onLogin} data-testid="error-login">
            Log in
          </Button>
        )}
      </div>
    );
  }
  // A reply is plain prose, no box (the Claude app look).
  return (
    <div
      className="reply self-stretch prose-measure flex flex-col gap-6 break-words"
      data-testid="reply"
    >
      <Markdown text={entry.text} />
      {replyEnd && <ReplyActions text={entry.text} at={entry.at} last={lastReply} />}
    </div>
  );
}

/** One console row: a message, a folded run of tool calls, or a desk action. */
export function ConsoleRowView({
  row,
  onOpenPromptHistory,
  job,
  onLogin,
}: {
  row: ConsoleRow;
  onOpenPromptHistory?: (catId: string) => void;
  job?: JobCardActions;
  onLogin?: () => void;
}) {
  if (row.kind === 'tools') return <ToolRow tools={row.tools} />;
  if (row.kind === 'action') return <ActionRow tool={row.tool} />;
  return (
    <MessageRow
      entry={row.entry}
      replyEnd={row.replyEnd}
      lastReply={row.lastReply}
      onOpenPromptHistory={onOpenPromptHistory}
      job={job}
      onLogin={onLogin}
    />
  );
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
