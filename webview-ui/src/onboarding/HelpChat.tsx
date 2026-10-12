import { Modal } from '../components/ui/Modal.js';
import { helpChat } from '../i18n/helpChat/en.js';
import { useT } from '../i18n/useT.js';

/**
 * HelpChat CONTRACT (fixed: two parallel agents build against it).
 *
 * - The onboarding agent MOUNTS `<HelpChat>` and owns when `open` flips. It never edits this file's body.
 * - The help chat agent IMPLEMENTS the body (LLM chat through ClaudeAdapter) and owns the `helpChat`
 *   i18n namespace. It keeps this props interface unchanged.
 * - `open=false` renders nothing and must not keep a Claude turn alive.
 * - `context` tells the chat where the user is, so the built-in prompt can tailor its first answer:
 *   'onboarding' = first-run walk-through, 'settings' = opened later from Settings.
 */
export interface HelpChatProps {
  open: boolean;
  onClose: () => void;
  context?: 'onboarding' | 'settings';
}

/** Placeholder body. Replaced by the help chat agent. */
export function HelpChat({ open, onClose }: HelpChatProps) {
  const t = useT(helpChat);
  return (
    <Modal isOpen={open} onClose={onClose} title={t('title')}>
      <p className="prose-body py-4 px-10">{t('placeholder')}</p>
    </Modal>
  );
}
