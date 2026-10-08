import { useEffect, useRef } from 'react';

import type { MentionMenuState } from './useMentionMenu.js';
import type { SlashMenuState } from './useSlashMenu.js';

/** One row on one line: the label, then a muted hint. */
function MenuRow({
  label,
  hint,
  title,
  active,
  onPick,
  onHover,
  testId,
}: {
  label: string;
  hint?: string;
  title: string;
  active: boolean;
  onPick(): void;
  onHover(): void;
  testId: string;
}) {
  const row = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (active) row.current?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);
  return (
    <button
      ref={row}
      type="button"
      // mousedown, not click: the message box keeps the focus.
      onMouseDown={(e) => {
        e.preventDefault();
        onPick();
      }}
      onMouseEnter={onHover}
      className={`composer-choice w-full min-w-0 ${active ? 'is-current' : ''}`}
      title={title}
      data-testid={testId}
    >
      {/* A row without a hint (a file path) gives the label the whole width. */}
      <span
        className={`composer-choice-label ${hint === undefined ? 'flex-1 min-w-0 truncate text-left' : 'shrink-0'}`}
      >
        {label}
      </span>
      {hint !== undefined && (
        <span className="composer-choice-hint flex-1 min-w-0 truncate text-left">{hint}</span>
      )}
    </button>
  );
}

/** The "/" menu above the message box, in the look of the composer menus (useSlashMenu has its keys). */
export function SlashMenu({ menu }: { menu: SlashMenuState }) {
  if (!menu.items.length) return null;
  return (
    <div
      className="slash-menu composer-list pixel-scrollbar prose-body"
      role="listbox"
      aria-label="Commands"
      data-testid="slash-menu"
    >
      {menu.items.map((command, n) => (
        <MenuRow
          key={`${command.name}-${n}`}
          label={`/${command.name}`}
          hint={[command.argumentHint, command.description].filter(Boolean).join('  ')}
          title={command.description}
          active={n === menu.active}
          onPick={() => menu.pick(command, true)}
          onHover={() => menu.setIndex(n)}
          testId={`slash-${command.name}`}
        />
      ))}
    </div>
  );
}

/** The "@" menu: files of the chat's folder (useMentionMenu has its keys). */
export function MentionMenu({ menu }: { menu: MentionMenuState }) {
  if (!menu.items.length) return null;
  return (
    <div
      className="slash-menu composer-list pixel-scrollbar prose-body"
      role="listbox"
      aria-label="Files"
      data-testid="mention-menu"
    >
      {menu.items.map((file, n) => (
        <MenuRow
          key={file}
          label={`@${file}`}
          title={file}
          active={n === menu.active}
          onPick={() => menu.pick(file)}
          onHover={() => menu.setIndex(n)}
          testId="mention-file"
        />
      ))}
    </div>
  );
}
