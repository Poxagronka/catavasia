/**
 * Text for work-conversation bubbles: a short line set over the speaker,
 * and the full text for the hover tooltip. Pure, unit-tested.
 */
import {
  SCENE_BUBBLE_LINE_CHARS,
  SCENE_BUBBLE_MAX_LINES,
  SCENE_TOOLTIP_MAX_CHARS,
} from '../../constants.js';
import type { CatMessageKind } from '../../orchestratorEvents.js';

const ELLIPSIS = '…';

/** One text bubble for the overlay. */
export interface SceneBubble {
  /** Stable React key. */
  key: string;
  catId: number;
  kind: CatMessageKind;
  lines: string[];
  tooltip: string;
  from: number;
  to: number;
}

type BubbleLine = {
  from: number;
  to: number;
  kind: CatMessageKind;
  text: string;
  summary?: string;
};

/** The bubble of `line`, drawn over `catId`. */
export function toBubble(key: string, catId: number, line: BubbleLine): SceneBubble {
  return {
    key,
    catId,
    kind: line.kind,
    lines: bubbleLines(line),
    tooltip: tooltipText(line),
    from: line.from,
    to: line.to,
  };
}

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Word-wrap `text` to at most `maxLines` lines of `lineChars` characters.
 * A word longer than a line is split. Text that does not fit ends with "…".
 */
export function wrapBubble(
  text: string,
  lineChars = SCENE_BUBBLE_LINE_CHARS,
  maxLines = SCENE_BUBBLE_MAX_LINES,
): string[] {
  const words = clean(text).split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';
  let cut = false;
  for (let i = 0; i < words.length; i++) {
    let word = words[i];
    while (word.length > 0) {
      const sep = line ? ' ' : '';
      if (line.length + sep.length + word.length <= lineChars) {
        line += sep + word;
        word = '';
      } else if (!line && word.length > lineChars) {
        lines.push(word.slice(0, lineChars));
        word = word.slice(lineChars);
      } else {
        lines.push(line);
        line = '';
      }
      if (lines.length === maxLines) {
        cut = word.length > 0 || line.length > 0 || i < words.length - 1;
        break;
      }
    }
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (cut) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = last.slice(0, lineChars - 1).trimEnd() + ELLIPSIS;
  }
  return lines;
}

/** The bubble lines for a message: its summary when present, else its text. */
export function bubbleLines(msg: { text: string; summary?: string }): string[] {
  return wrapBubble(msg.summary && clean(msg.summary) ? msg.summary : msg.text);
}

/** The tooltip text: the full summary, else the text (capped). */
export function tooltipText(msg: { text: string; summary?: string }): string {
  const s = clean(msg.summary && clean(msg.summary) ? msg.summary : msg.text);
  return s.length > SCENE_TOOLTIP_MAX_CHARS
    ? s.slice(0, SCENE_TOOLTIP_MAX_CHARS - 1) + ELLIPSIS
    : s;
}
