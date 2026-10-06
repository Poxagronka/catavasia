/**
 * Hover line of a cat between turns. The narrator's last work line ("kneading
 * the code") would stay on an idle cat forever, so a short while after the
 * line arrives an idle cat shows what it does now, in the same cat voice.
 * Pure: narratorStore and ToolOverlay call it.
 */

import type { NarratorState } from '../../core/src/narrator.js';
import type { Character } from './office/types.js';

/** How long the last line ("purring, all done") stays on a cat that went idle. */
export const NARRATOR_IDLE_AFTER_MS = 5000;

const ACTIVITY_LINES: Record<string, string> = {
  coffee: 'sipping coffee',
  brew: 'making coffee',
  coffeeSip: 'sipping coffee',
  coffeeReturn: 'bringing the cup back',
  groom: 'washing its face',
  yawn: 'yawning',
  stretch: 'having a big stretch',
  tailChase: 'chasing its tail',
  loaf: 'loafing',
  skillRead: 'reading the cat manual',
  sleep: 'taking a catnap',
  bed: 'taking a catnap',
  catBed: 'taking a catnap',
  house: 'napping in the house',
  scratch: 'sharpening claws',
  catTree: 'climbing the cat tree',
  box: 'sitting in a box',
  wander: 'on a stroll',
};
const PLAYING = 'playing';
const LOUNGING = 'lounging around';

/** What an idle cat does now, as a narrator line. */
export function idleLine(ch: Pick<Character, 'activity' | 'social'>): string {
  if (ch.social?.cloud || ch.social?.anger != null) return 'squabbling';
  if (ch.social?.bubble) return 'chatting with a friend';
  const id = ch.activity?.id;
  if (!id) return LOUNGING;
  return ACTIVITY_LINES[id] ?? PLAYING;
}

/**
 * True when an idle cat shows its idle line instead of the narrator line.
 * A cat that waits for the user keeps "meowing for you".
 */
export function showsIdleLine(
  line: { state: NarratorState; at: number },
  isActive: boolean,
  now: number,
): boolean {
  return !isActive && line.state !== 'waiting' && now - line.at >= NARRATOR_IDLE_AFTER_MS;
}
