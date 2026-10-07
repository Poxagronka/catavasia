import { useEffect, useRef } from 'react';

import type { DeskCommand } from '../../../core/src/ceoDesk.js';
import type { SlashMenuState } from './useSlashMenu.js';

/** One row on one line: `/name`, then the argument hint and the CLI's description, muted. */
function CommandRow({
  command,
  active,
  onPick,
  onHover,
}: {
  command: DeskCommand;
  active: boolean;
  onPick(): void;
  onHover(): void;
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
      title={command.description}
      data-testid={`slash-${command.name}`}
    >
      <span className="composer-choice-label shrink-0">/{command.name}</span>
      <span className="composer-choice-hint flex-1 min-w-0 truncate text-left">
        {[command.argumentHint, command.description].filter(Boolean).join('  ')}
      </span>
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
        <CommandRow
          key={`${command.name}-${n}`}
          command={command}
          active={n === menu.active}
          onPick={() => menu.pick(command, true)}
          onHover={() => menu.setIndex(n)}
        />
      ))}
    </div>
  );
}
