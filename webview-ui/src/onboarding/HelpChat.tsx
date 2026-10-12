import { useEffect, useRef, useState } from 'react';

import { Markdown } from '../components/taskBoard/Markdown.js';
import { Button } from '../components/ui/Button.js';
import { Modal } from '../components/ui/Modal.js';
import { helpChat } from '../i18n/helpChat/en.js';
import { useLanguage } from '../i18n/languageStore.js';
import { useT } from '../i18n/useT.js';
import {
  type HelpNote,
  resetHelpChat,
  sendHelpMessage,
  stopHelpChat,
  useHelpChat,
} from './helpChatApi.js';

/**
 * HelpChat CONTRACT (fixed).
 *
 * - The onboarding MOUNTS `<HelpChat>` and owns when `open` flips.
 * - `open=false` renders nothing and must not keep a Claude turn alive: closing stops the turn.
 * - `context` tells the chat where the user is, so the built-in prompt can tailor its first answer:
 *   'onboarding' = first-run walk-through, 'settings' = opened later from Settings.
 */
export interface HelpChatProps {
  open: boolean;
  onClose: () => void;
  context?: 'onboarding' | 'settings';
}

/** The help chat: an LLM guide (Claude Code, read-only) that answers questions and helps write cat prompts. */
export function HelpChat({ open, onClose, context = 'onboarding' }: HelpChatProps) {
  const t = useT(helpChat);
  const language = useLanguage();
  const { messages, draft, busy, unavailable } = useHelpChat();
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  // Closing the panel ends the running turn.
  useEffect(() => {
    if (!open) return;
    return () => stopHelpChat();
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, draft]);

  if (!open) return <></>;

  /** The server's reason code in the UI language; an unknown reason shows the server's text. */
  const noteText = (note: HelpNote): string => {
    switch (note.code) {
      case 'notInstalled':
        return t('unavailableNotInstalled');
      case 'notLoggedIn':
        return t('unavailableNotLoggedIn');
      case 'replaced':
        return t('errReplaced');
      case 'noAnswer':
        return t('errNoAnswer');
      case 'exited':
        return t('errExited', { code: note.exitCode ?? '' });
      default:
        return note.text;
    }
  };

  const submit = () => {
    if (!input.trim() || busy) return;
    sendHelpMessage(input, context, language);
    setInput('');
  };

  return (
    <Modal isOpen={open} onClose={onClose} title={t('title')} className="w-[min(92vw,640px)]">
      <div className="flex flex-col gap-6 px-10 pb-4" data-testid="help-chat">
        <div className="flex flex-col gap-6 max-h-[50vh] overflow-y-auto text-start">
          <p className="prose-body text-text-muted">
            {t(context === 'settings' ? 'greetingSettings' : 'greetingOnboarding')}
          </p>
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === 'user'
                  ? 'ms-24 bg-btn-bg p-6 whitespace-pre-wrap'
                  : m.role === 'error'
                    ? 'text-status-error p-6'
                    : 'me-24 p-6'
              }
            >
              {m.role === 'assistant' ? (
                <Markdown text={m.text} />
              ) : m.note ? (
                noteText(m.note)
              ) : (
                m.text
              )}
            </div>
          ))}
          {busy && (
            <div className="me-24 p-6">
              {draft ? (
                <Markdown text={draft} />
              ) : (
                <span className="text-text-muted">{t('thinking')}</span>
              )}
            </div>
          )}
          {unavailable && (
            <div className="text-status-error p-6" role="alert">
              {noteText(unavailable)}
            </div>
          )}
          <div ref={endRef} />
        </div>
        <textarea
          className="w-full bg-bg border-2 border-border p-6 text-start resize-none"
          rows={3}
          value={input}
          placeholder={t('placeholder')}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="flex gap-6 justify-end">
          <Button variant="ghost" size="md" onClick={resetHelpChat}>
            {t('newChat')}
          </Button>
          {busy ? (
            <Button size="md" onClick={stopHelpChat}>
              {t('stop')}
            </Button>
          ) : (
            <Button variant="accent" size="md" disabled={!input.trim()} onClick={submit}>
              {t('send')}
            </Button>
          )}
          <Button size="md" onClick={onClose}>
            {t('close')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
