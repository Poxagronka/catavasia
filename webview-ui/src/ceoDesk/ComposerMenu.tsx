import { type ReactNode, useEffect, useRef, useState } from 'react';

/**
 * A quiet label in the row under the message box that opens a small menu
 * above it. A click outside or Esc closes the menu. A new `openKey` opens it
 * (a slash command asked for it).
 */
export function ComposerMenu({
  label,
  title,
  testId,
  align = 'left',
  openKey,
  children,
}: {
  label: ReactNode;
  title: string;
  testId: string;
  align?: 'left' | 'right';
  openKey?: number;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (openKey) setOpen(true);
  }, [openKey]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  return (
    <span ref={box} className="relative shrink-0 flex">
      <button
        type="button"
        className="composer-pick"
        title={title}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-testid={testId}
      >
        {label}
      </button>
      {open && (
        <div
          className={`composer-menu ${align === 'right' ? 'right-0' : 'left-0'}`}
          role="dialog"
          aria-label={title}
          data-testid={`${testId}-menu`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </span>
  );
}
