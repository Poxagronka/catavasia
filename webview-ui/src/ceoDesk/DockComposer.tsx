import { type KeyboardEvent, type ReactNode, useState } from 'react';

import { Button } from '../components/ui/Button.js';

interface DockComposerProps {
  draft: string;
  onDraft(text: string): void;
  /** Resolves when the server took the message; rejects with its error text. */
  onSend(text: string): Promise<void>;
  /** Why Send is off (no token, engine not ready). The draft stays. */
  blocked: string | null;
  /** Shown above the box: the engine notice when Claude Code is not ready. */
  notice?: ReactNode;
}

/**
 * The message box of the CEO dock. Enter sends, Shift+Enter is a new line.
 * The input stays usable while the CEO works: a message then waits (queued).
 * The attachment strip and the attach button (phase 3) go in the marked slots.
 */
export function DockComposer({ draft, onDraft, onSend, blocked, notice }: DockComposerProps) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSend = !blocked && !sending && draft.trim() !== '';

  const submit = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      await onSend(draft.trim());
      onDraft('');
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

  return (
    <div className="border-t-2 border-border p-8 flex flex-col gap-6" data-testid="dock-composer">
      {notice}
      {(blocked || error) && (
        <span
          className={`prose-body prose-small ${error ? 'text-status-error' : 'text-text-muted'}`}
          data-testid="dock-blocked"
        >
          {error ?? blocked}
        </span>
      )}
      {/* Phase 3: the attachment strip (thumbnails, file chips) goes here. */}
      <textarea
        value={draft}
        onChange={(e) => onDraft(e.target.value)}
        onKeyDown={onKeyDown}
        rows={3}
        placeholder="Ask the CEO: a question, a link, or work for the team"
        className="w-full resize-none bg-bg-dark border-2 border-border focus:border-accent outline-none px-8 py-6 prose-body"
        data-testid="dock-input"
      />
      <div className="flex items-center gap-8">
        {/* Phase 3: the attach button goes here. */}
        <span className="flex-1 text-2xs text-text-muted truncate">
          Enter sends · Shift+Enter: new line
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
