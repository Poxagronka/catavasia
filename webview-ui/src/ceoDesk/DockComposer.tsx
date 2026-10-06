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
}

let nextId = 1;

/**
 * The message box of the CEO dock. Enter sends, Shift+Enter is a new line.
 * The input stays usable while the CEO works: a message then waits (queued).
 * Files come from paste, drag and drop, or the paperclip; a big image is
 * downscaled first, and a limit problem shows at once, before Send.
 */
export function DockComposer({ draft, onDraft, onSend, blocked, notice }: DockComposerProps) {
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
      <textarea
        value={draft}
        onChange={(e) => onDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        rows={3}
        placeholder="Ask the CEO: a question, a link, or work for the team. Paste or drop files."
        className="w-full resize-none bg-bg-dark border-2 border-border focus:border-accent outline-none px-8 py-6 prose-body"
        data-testid="dock-input"
      />
      <div className="flex items-center gap-8">
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
          onClick={() => picker.current?.click()}
          title="Attach images or files"
          aria-label="Attach images or files"
          data-testid="dock-attach"
        >
          📎
        </Button>
        <span className="flex-1 text-2xs text-text-muted truncate">
          {preparing ? 'Preparing files...' : 'Enter sends · Shift+Enter: new line'}
        </span>
        <Button
          variant={canSend ? 'accent' : 'disabled'}
          size="md"
          disabled={!canSend}
          onClick={() => void submit()}
          title={blocked ?? undefined}
          data-testid="dock-send"
        >
          Send
        </Button>
      </div>
    </div>
  );
}
