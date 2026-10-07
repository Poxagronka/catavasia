import { type KeyboardEvent, useEffect, useState } from 'react';

import type { DeskCommand } from '../../../core/src/ceoDesk.js';
import { matchCommands, slashQuery } from './slashCommands.js';

/**
 * The "/" menu of the message box: while the draft is "/" and a name, it
 * lists the matching commands. Arrows move, Tab completes, Enter completes
 * (and sends a command that takes nothing or is typed in full), Esc closes.
 * `onPick(text, send)`: the new draft, and whether to send it now.
 */
export function useSlashMenu(
  draft: string,
  commands: DeskCommand[],
  onPick: (text: string, send: boolean) => void,
) {
  const [index, setIndex] = useState(0);
  const [closedFor, setClosedFor] = useState<string | null>(null);
  const query = slashQuery(draft);
  const items = query === null || closedFor === draft ? [] : matchCommands(commands, query);
  useEffect(() => setIndex(0), [query]);
  // Esc closes the menu for this draft only.
  useEffect(() => {
    if (closedFor !== null && closedFor !== draft) setClosedFor(null);
  }, [draft, closedFor]);

  // Enter sends a command that takes nothing, or one typed in full ("/compact").
  const pick = (command: DeskCommand, send: boolean) => {
    const runs = send && (!command.argumentHint || command.name === query);
    onPick(runs ? `/${command.name}` : `/${command.name} `, runs);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!items.length) return false;
    const current = items[Math.min(index, items.length - 1)];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setIndex((i) => (i + step + items.length) % items.length);
    } else if (e.key === 'Tab') {
      pick(current, false);
    } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      pick(current, true);
    } else if (e.key === 'Escape') {
      setClosedFor(draft);
    } else {
      return false;
    }
    e.preventDefault();
    e.stopPropagation();
    return true;
  };

  return { items, active: Math.min(index, items.length - 1), setIndex, pick, onKeyDown };
}

export type SlashMenuState = ReturnType<typeof useSlashMenu>;
