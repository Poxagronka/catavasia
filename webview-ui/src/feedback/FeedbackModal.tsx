/**
 * The Feedback form: title, description, images (office screenshot, file
 * picker, Cmd/Ctrl+V paste). Send asks the server to create a GitHub issue
 * with the user's local `gh`; when it cannot, the server hands back a
 * prefilled GitHub form and the user opens it from here.
 */

import { type ClipboardEvent, useEffect, useRef, useState } from 'react';

import {
  FEEDBACK_DESCRIPTION_MAX_CHARS,
  FEEDBACK_TITLE_MAX_CHARS,
} from '../../../core/src/constants.js';
import type { FeedbackResult } from '../../../core/src/messages.js';
import { AttachmentStrip } from '../ceoDesk/AttachmentStrip.js';
import type { DraftAttachment } from '../ceoDesk/attachState.js';
import { prepareAttachment, toUploads } from '../ceoDesk/prepareAttachment.js';
import { FIELD } from '../components/cats/fields.js';
import { Button } from '../components/ui/Button.js';
import { Modal } from '../components/ui/Modal.js';
import { FEEDBACK_REPLY_TIMEOUT_MS } from '../constants.js';
import { transport } from '../transport/index.js';
import { captureOffice, copyImage } from './feedbackImages.js';
import { feedbackAttachError } from './feedbackLimits.js';

type Phase = { kind: 'editing' } | { kind: 'sending' } | { kind: 'done'; result: FeedbackResult };

const LINK = 'text-accent-bright underline break-all';

let nextId = 1;

export function FeedbackModal({ isOpen, onClose }: { isOpen: boolean; onClose(): void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<DraftAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'editing' });
  const [copied, setCopied] = useState<boolean | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const filesRef = useRef(files);
  filesRef.current = files;

  const busyRef = useRef(false);
  const unsubscribe = useRef<(() => void) | null>(null);

  // Thumbnails are object URLs: free them when the form goes away.
  useEffect(
    () => () => {
      filesRef.current.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
      unsubscribe.current?.();
    },
    [],
  );

  const stopListening = () => {
    unsubscribe.current?.();
    unsubscribe.current = null;
  };

  const addFiles = async (list: File[]) => {
    if (!list.length) return;
    // One add at a time: two at once would both check the limits against the old list.
    if (busyRef.current) return setError('Wait until the images are ready');
    busyRef.current = true;
    setError(null);
    setBusy(true);
    try {
      const ready = await Promise.all(list.map((f) => prepareAttachment(f, nextId++)));
      const problem = feedbackAttachError(filesRef.current, ready);
      if (problem) {
        ready.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
        setError(problem);
        return;
      }
      setFiles((current) => [...current, ...ready]);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const screenshot = async () => {
    const shot = await captureOffice();
    if (shot) await addFiles([shot]);
    else setError('Could not capture the office');
  };

  const remove = (id: number) => {
    const gone = files.find((f) => f.id === id);
    if (gone?.preview) URL.revokeObjectURL(gone.preview);
    setFiles(files.filter((f) => f.id !== id));
    setError(null);
  };

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const images = Array.from(e.clipboardData.files);
    if (!images.length) return; // Plain text pastes as usual.
    e.preventDefault();
    void addFiles(images);
  };

  const send = async () => {
    if (!title.trim() || busy) return;
    setError(null);
    setPhase({ kind: 'sending' });
    const fail = (message: string) => {
      stopListening();
      setError(message);
      setPhase({ kind: 'editing' });
    };
    // The server answers a submitFeedback with one feedbackResult. Listen before the send.
    // A lost answer (socket drop, server restart) must not lock the form.
    stopListening();
    const timer = setTimeout(
      () => fail('No answer from the server. Check GitHub before you send again.'),
      FEEDBACK_REPLY_TIMEOUT_MS,
    );
    const off = transport.onMessage((msg) => {
      if (msg.type !== 'feedbackResult') return;
      stopListening();
      if (msg.status === 'error') fail(msg.error ?? 'The server refused the feedback');
      else setPhase({ kind: 'done', result: msg });
    });
    unsubscribe.current = () => {
      clearTimeout(timer);
      off();
    };
    try {
      const images = await toUploads(files);
      transport.send({ type: 'submitFeedback', title: title.trim(), description, images });
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  };

  const reset = () => {
    files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    setFiles([]);
    setTitle('');
    setDescription('');
    setError(null);
    setCopied(null);
    setPhase({ kind: 'editing' });
  };

  const close = () => {
    // Created: start clean next time. A fallback keeps the draft and its images
    // because the user still pastes them into the GitHub form.
    if (phase.kind === 'done' && phase.result.status === 'created') reset();
    else if (phase.kind === 'done') setPhase({ kind: 'editing' });
    onClose();
  };

  // Click handlers: the click is the gesture the clipboard needs.
  const openFallback = () => {
    if (files[0]) void copyImage(files[0].blob).then(setCopied);
  };

  const result = phase.kind === 'done' ? phase.result : null;

  return (
    <Modal isOpen={isOpen} onClose={close} title="Feedback" className="w-[min(560px,94vw)]">
      {/* Keep office shortcuts (R, T, Esc, Ctrl+Z...) out of the form fields. */}
      <div
        className="flex flex-col gap-8 px-10 pb-10"
        onKeyDown={(e) => e.stopPropagation()}
        onPaste={onPaste}
        data-testid="feedback-form"
      >
        {result?.status === 'created' && (
          <p className="prose-body" data-testid="feedback-created">
            Thank you! The issue is on GitHub:{' '}
            <a href={result.url} target="_blank" rel="noopener noreferrer" className={LINK}>
              {result.url}
            </a>
          </p>
        )}
        {result?.status === 'fallback' && (
          <div className="flex flex-col gap-6 prose-body" data-testid="feedback-fallback">
            <span className="text-text-muted prose-small">{result.error}</span>
            <span>Send it from the GitHub form in your browser instead:</span>
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className={LINK}
              onClick={openFallback}
            >
              Open the GitHub issue form
            </a>
            {files.length > 0 && (
              <>
                <span className="prose-small text-text-muted">
                  {copied
                    ? 'An image is on the clipboard: paste it into the form (Cmd/Ctrl+V).'
                    : 'Paste your images into the GitHub form: a link cannot carry them.'}
                </span>
                <div className="flex flex-wrap gap-4">
                  {files.map((f, i) => (
                    <Button
                      key={f.id}
                      size="sm"
                      onClick={() => void copyImage(f.blob).then(setCopied)}
                    >
                      Copy image {i + 1}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {!result && (
          <>
            <input
              className={FIELD}
              placeholder="Title"
              value={title}
              maxLength={FEEDBACK_TITLE_MAX_CHARS}
              onChange={(e) => setTitle(e.target.value)}
              disabled={phase.kind === 'sending'}
              data-testid="feedback-title"
            />
            <textarea
              className={`${FIELD} text-xs h-120 resize-y`}
              placeholder="What happened? What did you expect? Paste images with Cmd/Ctrl+V."
              value={description}
              maxLength={FEEDBACK_DESCRIPTION_MAX_CHARS}
              onChange={(e) => setDescription(e.target.value)}
              disabled={phase.kind === 'sending'}
              data-testid="feedback-description"
            />
            <AttachmentStrip files={files} onRemove={remove} />
            <div className="flex flex-wrap gap-4">
              <Button
                size="md"
                onClick={() => void screenshot()}
                disabled={busy || phase.kind === 'sending'}
                data-testid="feedback-screenshot"
              >
                Screenshot office
              </Button>
              <Button
                size="md"
                onClick={() => picker.current?.click()}
                disabled={busy || phase.kind === 'sending'}
              >
                Add images
              </Button>
              <input
                ref={picker}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                hidden
                onChange={(e) => {
                  void addFiles(Array.from(e.target.files ?? []));
                  e.target.value = '';
                }}
              />
            </div>
            <span className="prose-small text-text-muted">
              Your catavasia version, host and OS are added to the issue.
            </span>
          </>
        )}
        {error && (
          <span className="prose-small text-status-error" data-testid="feedback-error">
            {error}
          </span>
        )}
        <div className="flex justify-end gap-4">
          {result ? (
            <Button size="md" onClick={close}>
              Close
            </Button>
          ) : (
            <>
              <Button size="md" variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button
                size="md"
                variant={title.trim() && !busy && phase.kind === 'editing' ? 'accent' : 'disabled'}
                onClick={() => void send()}
                disabled={!title.trim() || busy || phase.kind !== 'editing'}
                data-testid="feedback-send"
              >
                {phase.kind === 'sending' ? 'Sending...' : 'Send'}
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
