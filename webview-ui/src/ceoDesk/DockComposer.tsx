import {
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { CeoAttachmentUpload, DeskCommand } from '../../../core/src/ceoDesk.js';
import { AttachmentStrip } from './AttachmentStrip.js';
import { attachError, type DraftAttachment } from './attachState.js';
import { shownSuggestion } from './dockState.js';
import { prepareAttachment, toUploads } from './prepareAttachment.js';
import { catchCommand } from './slashCommands.js';
import { MentionMenu, SlashMenu } from './SlashMenu.js';
import { useComposerHistory } from './useComposerHistory.js';
import { useMentionMenu } from './useMentionMenu.js';
import { useSlashMenu } from './useSlashMenu.js';

interface DockComposerProps {
  draft: string;
  onDraft(text: string): void;
  /** Resolves when the server took the message; rejects with its error text. */
  onSend(text: string, attachments: CeoAttachmentUpload[]): Promise<void>;
  /** Why Send is off (no token, engine not ready). The draft stays. */
  blocked: string | null;
  /** Shown above the box: the engine notice when Claude Code is not ready. */
  notice?: ReactNode;
  /** Files that come back to the box (Stop returns the queued messages). */
  restored?: File[];
  /** The restored files are in the box: the dock forgets them (no second add on a remount). */
  onRestored?(): void;
  /** The left of the row under the box, after "+": the CEO's permission mode. */
  mode?: ReactNode;
  /** The right of the row under the box: the CEO's model, effort and context ring. */
  settings?: ReactNode;
  /** What "/" offers (Claude Code's commands); none: no menu. */
  commands?: DeskCommand[];
  /** Claude's guess of the next message: ghost text in the empty box, Tab or a click takes it. */
  suggestion?: string;
  /** Esc while the CEO works stops the turn, as in the terminal (the draft stays). None: idle. */
  onStop?(): void;
  /** The messages this chat sent, newest first: ArrowUp and ArrowDown walk them. */
  history?: string[];
  /** Shift+Tab: the next permission mode, as in the terminal. */
  onCycleMode?(): void;
}

/** A quiet return arrow (the Claude app send glyph). */
function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M13 3v5a2 2 0 0 1-2 2H3m0 0 3-3m-3 3 3 3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The attach glyph: a plus centered in its 28px box. */
function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

let nextId = 1;

/**
 * The message box of the CEO dock (the Claude app look): one box with the send
 * arrow inside, and under it "+" (attach) left and the CEO settings right.
 * Enter sends, Shift+Enter is a new line, Shift+Tab cycles the mode, the
 * arrows walk the sent messages, and `@` offers the folder's files.
 * The input stays usable while the CEO works: a message goes into the running
 * session at once, and Esc stops the turn.
 * Files come from paste, drag and drop, or the paperclip; a big image is
 * downscaled first, and a limit problem shows at once, before Send.
 */
export function DockComposer({
  draft,
  onDraft,
  onSend,
  blocked,
  notice,
  restored,
  onRestored,
  mode,
  settings,
  commands = [],
  suggestion,
  onStop,
  history = [],
  onCycleMode,
}: DockComposerProps) {
  const [sending, setSending] = useState(false);
  const [preparing, setPreparing] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<DraftAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [caret, setCaret] = useState(0);
  const picker = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const filesRef = useRef(files);
  filesRef.current = files;
  // Send is off, but a command the dock answers itself (/help, /model...) still works.
  const stopped = (text: string) => !!blocked && (files.length > 0 || !catchCommand(text));
  const ghost = shownSuggestion(draft, files.length, suggestion);
  const canSend =
    !stopped(draft) && !sending && !preparing && (draft.trim() !== '' || files.length > 0);

  // Thumbnails are object URLs: free them when the dock goes away.
  useEffect(
    () => () => filesRef.current.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)),
    [],
  );

  const addFiles = async (list: FileList | File[]) => {
    const picked = Array.from(list);
    if (!picked.length) return;
    setError(null);
    setPreparing((n) => n + 1);
    try {
      const ready = await Promise.all(picked.map((f) => prepareAttachment(f, nextId++)));
      const problem = attachError(filesRef.current, ready);
      if (problem) {
        ready.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
        setError(problem);
        return;
      }
      setFiles((current) => [...current, ...ready]);
    } finally {
      setPreparing((n) => n - 1);
    }
  };

  useEffect(() => {
    if (!restored?.length) return;
    void addFiles(restored);
    onRestored?.();
    // addFiles reads the newest files through filesRef: only a new list matters.
  }, [restored]);

  const remove = (id: number) => {
    const gone = files.find((f) => f.id === id);
    if (gone?.preview) URL.revokeObjectURL(gone.preview);
    setFiles(files.filter((f) => f.id !== id));
    setError(null);
  };

  const submit = async (text = draft) => {
    if (stopped(text) || sending || preparing || (!text.trim() && !files.length)) return;
    setSending(true);
    setError(null);
    try {
      await onSend(text.trim(), await toUploads(files));
      onDraft('');
      files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
      setFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const slash = useSlashMenu(draft, commands, (text, send) =>
    send ? void submit(text) : onDraft(text),
  );

  const mention = useMentionMenu(draft, caret, (text, at) => {
    onDraft(text);
    setCaret(at);
    // After React writes the new text: the caret goes after the inserted path.
    requestAnimationFrame(() => box.current?.setSelectionRange(at, at));
  });
  const recall = useComposerHistory(history, draft, onDraft);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slash.onKeyDown(e) || mention.onKeyDown(e)) return;
    if (e.key === 'Tab' && e.shiftKey && onCycleMode) {
      e.preventDefault();
      onCycleMode();
      return;
    }
    if (recall.onKeyDown(e)) return;
    if (e.key === 'Escape' && onStop) {
      e.preventDefault();
      onStop();
      return;
    }
    if (e.key === 'Tab' && !e.shiftKey && ghost) {
      e.preventDefault();
      onDraft(ghost);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!e.clipboardData.files.length) return;
    e.preventDefault();
    void addFiles(e.clipboardData.files);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDragging(true);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    setDragging(false);
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    void addFiles(e.dataTransfer.files);
  };

  return (
    <div
      className={`border-t-2 px-16 py-12 flex flex-col gap-8 ${dragging ? 'border-accent bg-active-bg' : 'border-border'}`}
      onDragOver={onDragOver}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      data-testid="dock-composer"
    >
      {notice}
      {(blocked || error) && (
        <span
          className={`prose-body prose-small ${error ? 'text-status-error' : 'text-text-muted'}`}
          data-testid="dock-blocked"
        >
          {error ?? blocked}
        </span>
      )}
      <AttachmentStrip files={files} onRemove={remove} />
      <SlashMenu menu={slash} />
      <MentionMenu menu={mention} />
      <div
        className="flex items-end gap-4 bg-bg-dark border-2 border-border focus-within:border-accent rounded-[12px] pl-4 pr-6"
        data-testid="dock-box"
      >
        <textarea
          ref={box}
          value={draft}
          onChange={(e) => {
            onDraft(e.target.value);
            setCaret(e.target.selectionStart);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          rows={2}
          placeholder={ghost ?? 'Ask the CEO anything. Type / for commands, @ for files.'}
          className="flex-1 min-w-0 resize-none bg-transparent border-0 outline-none px-8 py-6 prose-body"
          data-testid="dock-input"
        />
        <button
          type="button"
          disabled={!canSend}
          onClick={() => void submit()}
          title={(stopped(draft) && blocked) || 'Send (Enter). Shift+Enter: new line'}
          aria-label="Send"
          className={`shrink-0 w-28 h-28 mb-6 flex items-center justify-center rounded-[6px] border-0 bg-transparent ${
            canSend
              ? 'text-text hover:bg-btn-hover cursor-pointer'
              : 'text-text-muted opacity-50 cursor-default'
          }`}
          data-testid="dock-send"
        >
          <SendIcon />
        </button>
      </div>
      <div className="composer-meta flex items-center gap-8 min-w-0">
        <input
          ref={picker}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = '';
          }}
          data-testid="dock-file-input"
        />
        <button
          type="button"
          className="dock-ctl is-icon"
          onClick={() => picker.current?.click()}
          title="Attach images or files"
          aria-label="Attach images or files"
          data-testid="dock-attach"
        >
          <PlusIcon />
        </button>
        {mode}
        <span className="flex-1 truncate">
          {preparing
            ? 'Preparing files...'
            : ghost && (
                <button
                  type="button"
                  className="quiet-btn"
                  onClick={() => onDraft(ghost)}
                  title={ghost}
                  data-testid="dock-suggestion"
                >
                  Tab: use the suggestion
                </button>
              )}
        </span>
        {settings}
      </div>
    </div>
  );
}
