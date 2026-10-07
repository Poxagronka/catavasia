import { useEffect, useRef } from 'react';

import type { DeskCommand } from '../../../core/src/ceoDesk.js';
import type { SlashMenuState } from './useSlashMenu.js';

/** One row: `/name <hint>` and the CLI's description on one line. */
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
      <span className="shrink-0 text-text">/{command.name}</span>
      {command.argumentHint && (
        <span className="shrink-0 text-text-muted max-w-[40%] truncate">
          {command.argumentHint}
        </span>
      )}
      <span className="flex-1 min-w-0 truncate text-left text-text-muted">
        {command.description}
      </span>
    </button>
  );
}

/** The "/" menu above the message box (useSlashMenu has its keys). */
export function SlashMenu({ menu }: { menu: SlashMenuState }) {
  if (!menu.items.length) return null;
  return (
    <div
      className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pixel-scrollbar bg-bg-dark border-2 border-border rounded-[10px] p-4 prose-body prose-small"
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
