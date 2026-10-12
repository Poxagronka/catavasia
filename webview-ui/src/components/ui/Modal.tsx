import { type ReactNode, useEffect } from 'react';

import { chrome } from '../../i18n/chrome/en.js';
import { useT } from '../../i18n/useT.js';
import { Button } from './Button.js';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** z-index for backdrop (modal gets +1). Default 49 */
  zIndex?: number;
  className?: string;
  /** Anchor the top edge and keep clear of the bottom toolbar: the modal stays put when its content changes (tabs). */
  pinTop?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  zIndex = 50,
  className = '',
  pinTop = false,
}: ModalProps) {
  const t = useT(chrome);
  // Escape closes the modal. Capture phase: a panel under it (the onboarding) stops keydown from bubbling.
  // The close waits until the key has reached its target, so an inner field that uses Escape (and calls
  // preventDefault) keeps it.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTimeout(() => !e.defaultPrevented && onClose(), 0);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, onClose]);
  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50" style={{ zIndex }} onClick={onClose} />
      <div
        className={`fixed left-1/2 -translate-x-1/2 ${
          pinTop
            ? 'top-(--modal-top) flex flex-col max-h-[calc(100vh-var(--modal-top)-var(--modal-bottom-clear))]'
            : 'top-1/2 -translate-y-1/2'
        } bg-bg border-2 border-border rounded-none shadow-pixel p-4 min-w-xs ${className}`}
        style={{ zIndex: zIndex + 1 }}
      >
        <div className="flex items-center justify-between py-4 px-10 border-b border-border mb-4">
          <span className="text-accent-bright text-2xl">{title}</span>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('close')}>
            x
          </Button>
        </div>
        {pinTop ? <div className="min-h-0 overflow-y-auto">{children}</div> : children}
      </div>
    </>
  );
}
