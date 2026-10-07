import { type KeyboardEvent, useEffect, useState } from 'react';

import type { CatSessionEntry } from '../../../core/src/catSession.js';

/** The messages this chat sent, newest first (what the Up arrow walks). */
export function sentMessages(entries: CatSessionEntry[]): string[] {
  return entries.flatMap((e) => (e.kind === 'user' && e.text ? [e.text] : [])).reverse();
}

/** Where the arrows stand in the sent messages (-1: the user's own draft, kept in `saved`). */
export interface HistoryState {
  index: number;
  saved: string;
}

export const NOT_BROWSING: HistoryState = { index: -1, saved: '' };

/**
 * The next place for an arrow key, as the terminal does it, or null: the key
 * moves the caret. Up starts on the first line of the draft (an empty draft
 * too) and then walks to older messages; Down walks back, and past the newest
 * it gives back the draft the user had. `sent` is newest first.
 */
export function historyStep(
  sent: string[],
  at: HistoryState,
  key: 'ArrowUp' | 'ArrowDown',
  draft: string,
  caret: number,
): { at: HistoryState; draft: string } | null {
  if (key === 'ArrowUp') {
    const firstLine = !draft.slice(0, caret).includes('\n');
    if ((at.index < 0 && !firstLine) || at.index + 1 >= sent.length) return null;
    const index = at.index + 1;
    return { at: { index, saved: at.index < 0 ? draft : at.saved }, draft: sent[index] };
  }
  if (at.index < 0) return null;
  const index = at.index - 1;
  return { at: { index, saved: at.saved }, draft: index < 0 ? at.saved : sent[index] };
}

/** ArrowUp / ArrowDown through the sent messages. Typing leaves the history. */
export function useComposerHistory(sent: string[], draft: string, onDraft: (text: string) => void) {
  const [at, setAt] = useState(NOT_BROWSING);
  useEffect(() => {
    if (at.index >= 0 && draft !== sent[at.index]) setAt(NOT_BROWSING);
  }, [draft, sent, at.index]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return false;
    if (e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return false;
    const next = historyStep(sent, at, e.key, draft, e.currentTarget.selectionStart);
    if (!next) return false;
    e.preventDefault();
    setAt(next.at);
    onDraft(next.draft);
    return true;
  };
  return { onKeyDown };
}
