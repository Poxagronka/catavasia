/**
 * Hover line of a cat between turns. The narrator's last work line ("kneading
 * the code") would stay on an idle cat forever, so a short while after the
 * line arrives an idle cat shows what it does now, in the same cat voice.
 * Pure: narratorStore and ToolOverlay call it.
 */

import type { NarratorState } from '../../core/src/narrator.js';
import type { MessageKey } from './i18n/core.js';
import { translate } from './i18n/dictionaries.js';
import { getLanguage } from './i18n/languageStore.js';
import { office } from './i18n/office/en.js';
import type { Character } from './office/types.js';

/** How long the last line ("purring, all done") stays on a cat that went idle. */
export const NARRATOR_IDLE_AFTER_MS = 5000;

type IdleKey = MessageKey<typeof office>;

/** Activity id -> dictionary key of its idle line. */
const ACTIVITY_LINES: Record<string, IdleKey> = {
  coffee: 'idleCoffee',
  brew: 'idleBrew',
  coffeeSip: 'idleCoffee',
  coffeeReturn: 'idleCoffeeReturn',
  groom: 'idleGroom',
  yawn: 'idleYawn',
  stretch: 'idleStretch',
  tailChase: 'idleTailChase',
  loaf: 'idleLoaf',
  skillRead: 'idleSkillRead',
  sleep: 'idleNap',
  bed: 'idleNap',
  catBed: 'idleNap',
  house: 'idleHouse',
  scratch: 'idleScratch',
  catTree: 'idleCatTree',
  box: 'idleBox',
  wander: 'idleWander',
};

/** What an idle cat does now, as a narrator line. */
export function idleLine(ch: Pick<Character, 'activity' | 'social'>): string {
  const say = (key: IdleKey) => translate(office, key, getLanguage());
  if (ch.social?.cloud || ch.social?.anger != null) return say('idleSquabbling');
  if (ch.social?.bubble) return say('idleChatting');
  const id = ch.activity?.id;
  if (!id) return say('idleLounging');
  return say(ACTIVITY_LINES[id] ?? 'idlePlaying');
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
