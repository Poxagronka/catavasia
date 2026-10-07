import {
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { CeoAttachmentUpload } from '../../../core/src/ceoDesk.js';
import { Button } from '../components/ui/Button.js';
import { AttachmentStrip } from './AttachmentStrip.js';
import { attachError, type DraftAttachment } from './attachState.js';
import { prepareAttachment, toUploads } from './prepareAttachment.js';

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

let nextId = 1;

/**
 * The message box of the CEO dock (the Claude app look): one box with the send
 * arrow inside, and under it "+" (attach) left and the CEO settings right.
 * Enter sends, Shift+Enter is a new line.
 * The input stays usable while the CEO works: a message then waits (queued).
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
}: DockComposerProps) {
  const [sending, setSending] = useState(false);
  const [preparing, setPreparing] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<DraftAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const filesRef = useRef(files);
  filesRef.current = files;
  const canSend = !blocked && !sending && !preparing && (draft.trim() !== '' || files.length > 0);

  // Thumbnails are object URLs: free them when the dock goes away.
  useEffect(
    () => () => filesRef.current.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)),
    [],
  );

  const addFiles = async (list: FileList | File[]) => {
    const picked = [...list];
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

  const submit = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      await onSend(draft.trim(), await toUploads(files));
      onDraft('');
      files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
      setFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
      className={`border-t-2 p-8 flex flex-col gap-6 ${dragging ? 'border-accent bg-active-bg' : 'border-border'}`}
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
      <div className="flex items-end gap-4 bg-bg-dark border-2 border-border focus-within:border-accent rounded-[12px] pl-4 pr-6">
        <textarea
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          rows={2}
          placeholder="Ask the CEO anything. Paste or drop files here."
          className="flex-1 min-w-0 resize-none bg-transparent border-0 outline-none px-8 py-6 prose-body"
          data-testid="dock-input"
        />
        <button
          type="button"
          disabled={!canSend}
          onClick={() => void submit()}
          title={blocked ?? 'Send (Enter). Shift+Enter: new line'}
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
      <div className="composer-meta flex items-center gap-12 min-w-0 px-4">
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
        <Button
          variant="ghost"
          size="icon"
          className="composer-meta text-[18px]! text-text-soft! hover:text-text! w-24! h-24! rounded-[6px]!"
          onClick={() => picker.current?.click()}
          title="Attach images or files"
          aria-label="Attach images or files"
          data-testid="dock-attach"
        >
          +
        </Button>
        {mode}
        <span className="flex-1 truncate">{preparing ? 'Preparing files...' : ''}</span>
        {settings}
      </div>
    </div>
  );
}
