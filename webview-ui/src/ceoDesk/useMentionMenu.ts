import { type KeyboardEvent, useEffect, useState } from 'react';

import { ceoDeskApi } from './ceoDeskApi.js';

/** The `@` mention typed right before the caret: where its `@` is and the text after it. */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const typed = /(^|\s)@([^\s@]*)$/.exec(text.slice(0, caret));
  return typed ? { start: caret - typed[2].length - 1, query: typed[2] } : null;
}

/** The draft after a pick: `@path ` takes the place of the typed mention; the caret goes after it. */
export function insertMention(
  text: string,
  start: number,
  caret: number,
  file: string,
): { text: string; caret: number } {
  const mention = `@${file} `;
  return {
    text: text.slice(0, start) + mention + text.slice(caret),
    caret: start + mention.length,
  };
}

/**
 * The `@` menu of the message box: while the word at the caret is `@` and a
 * name, it lists the matching files of the chat's folder (the server ranks
 * and caps them). Arrows move, Tab or Enter inserts `@path`, Esc closes.
 * Claude Code reads a mentioned file itself, so the text goes as typed.
 */
export function useMentionMenu(
  draft: string,
  caret: number,
  onPick: (text: string, caret: number) => void,
) {
  const mention = mentionQuery(draft, caret);
  const query = mention?.query ?? null;
  const [files, setFiles] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [closedFor, setClosedFor] = useState<string | null>(null);
  useEffect(() => {
    setIndex(0);
    if (query === null) return setFiles([]);
    let live = true;
    ceoDeskApi.files(query).then(
      (r) => live && setFiles(r.files),
      () => live && setFiles([]),
    );
    return () => {
      live = false;
    };
  }, [query]);
  // Esc closes the menu for this draft only.
  useEffect(() => {
    if (closedFor !== null && closedFor !== draft) setClosedFor(null);
  }, [draft, closedFor]);
  const items = !mention || closedFor === draft ? [] : files;
  const active = Math.min(index, items.length - 1);

  const pick = (file: string) => {
    if (!mention) return;
    const next = insertMention(draft, mention.start, caret, file);
    onPick(next.text, next.caret);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!items.length) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setIndex((i) => (i + step + items.length) % items.length);
    } else if ((e.key === 'Tab' && !e.shiftKey) || (e.key === 'Enter' && !e.shiftKey)) {
      if (e.nativeEvent.isComposing) return false;
      pick(items[active]);
    } else if (e.key === 'Escape') {
      setClosedFor(draft);
    } else {
      return false;
    }
    e.preventDefault();
    e.stopPropagation();
    return true;
  };

  return { items, active, setIndex, pick, onKeyDown };
}

export type MentionMenuState = ReturnType<typeof useMentionMenu>;
