import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';

const ITEM = '[role="menuitemradio"]';

/**
 * A quiet label in the row under the message box that opens a small menu
 * above the row, at its left or right edge. A click outside or Esc closes
 * the menu. In a list menu the arrows move between the rows, Enter picks one.
 * A new `openKey` opens it (a slash command asked for it).
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
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (openKey) setOpen(true);
  }, [openKey]);
  useEffect(() => {
    if (!open) return;
    const at = (q: string) => menu.current?.querySelector<HTMLElement>(q);
    (at(`${ITEM}[aria-checked="true"]`) ?? at(ITEM))?.focus();
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  const onMenuKey = (e: ReactKeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...(menu.current?.querySelectorAll<HTMLElement>(ITEM) ?? [])];
    if (items.length === 0) return;
    e.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    items[(at + step + items.length) % items.length].focus();
  };
  return (
    <span ref={box} className="shrink-0 flex">
      <button
        ref={trigger}
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
          ref={menu}
          className={`composer-menu ${align === 'right' ? 'right-0' : 'left-0'}`}
          role="dialog"
          aria-label={title}
          onKeyDown={onMenuKey}
          data-testid={`${testId}-menu`}
        >
          {children(close)}
        </div>
      )}
    </span>
  );
}
