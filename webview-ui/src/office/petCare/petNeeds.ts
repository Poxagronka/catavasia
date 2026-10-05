import {
  PET_HYGIENE_DECAY_PER_FLOOR_POOP,
  PET_HYGIENE_DECAY_PER_FULL_BOX,
  PET_MOOD_CONTENT,
  PET_MOOD_GRUMPY,
  PET_MOOD_HAPPY,
  PET_NEED_DECAY_PER_HOUR,
  PET_NEED_MAX,
  PET_NEED_START,
  PET_OFFLINE_DECAY_FACTOR,
  PET_OFFLINE_MAX_CATCHUP_HOURS,
  PET_REQUEST_THRESHOLD,
} from '../../constants.js';

/** Satisfaction meters, 0..PET_NEED_MAX. 100 = content, 0 = desperate. */
export const NEED_KEYS = ['hunger', 'thirst', 'affection', 'fun', 'hygiene'] as const;
export type NeedKey = (typeof NEED_KEYS)[number];
export type Needs = Record<NeedKey, number>;

/** What a cat asks for when a need runs low (one bubble icon each). */
export type RequestKind = 'food' | 'water' | 'scratch' | 'play' | 'litter';
export const REQUEST_FOR_NEED: Record<NeedKey, RequestKind> = {
  hunger: 'food',
  thirst: 'water',
  affection: 'scratch',
  fun: 'play',
  hygiene: 'litter',
};

export const NEED_LABELS: Record<NeedKey, string> = {
  hunger: 'Food',
  thirst: 'Water',
  affection: 'Love',
  fun: 'Fun',
  hygiene: 'Clean',
};

export type MoodLabel = 'Happy' | 'Content' | 'Grumpy' | 'Miserable';

export function clampNeed(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(PET_NEED_MAX, Math.max(0, v));
}

export function freshNeeds(): Needs {
  return {
    hunger: PET_NEED_START,
    thirst: PET_NEED_START,
    affection: PET_NEED_START,
    fun: PET_NEED_START,
    hygiene: PET_NEED_START,
  };
}

/** Coerce persisted (untrusted) data to valid needs; missing keys start fresh. */
export function sanitizeNeeds(raw: unknown): Needs {
  const out = freshNeeds();
  if (!raw || typeof raw !== 'object') return out;
  for (const k of NEED_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === 'number') out[k] = clampNeed(v);
  }
  return out;
}

/** The environment that speeds up hygiene loss. */
export interface DecayEnv {
  floorPoops: number;
  fullBoxes: number;
}

/** Decay every need by `hours` of office time. Mutates and returns `needs`. */
export function decayNeeds(needs: Needs, hours: number, env: DecayEnv): Needs {
  if (hours <= 0) return needs;
  for (const k of NEED_KEYS) needs[k] = clampNeed(needs[k] - PET_NEED_DECAY_PER_HOUR[k] * hours);
  const dirt =
    env.floorPoops * PET_HYGIENE_DECAY_PER_FLOOR_POOP +
    env.fullBoxes * PET_HYGIENE_DECAY_PER_FULL_BOX;
  needs.hygiene = clampNeed(needs.hygiene - dirt * hours);
  return needs;
}

export function raiseNeed(needs: Needs, key: NeedKey, amount: number): void {
  needs[key] = clampNeed(needs[key] + amount);
}

/** Mood = mean of the average need and the lowest need: one neglected need sours it. */
export function moodScore(needs: Needs): number {
  const values = NEED_KEYS.map((k) => needs[k]);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return (avg + Math.min(...values)) / 2;
}

export function moodLabel(score: number): MoodLabel {
  if (score >= PET_MOOD_HAPPY) return 'Happy';
  if (score >= PET_MOOD_CONTENT) return 'Content';
  if (score >= PET_MOOD_GRUMPY) return 'Grumpy';
  return 'Miserable';
}

/** The most urgent request (lowest need under the threshold), or null. */
export function pickRequest(needs: Needs): RequestKind | null {
  let worst: NeedKey | null = null;
  for (const k of NEED_KEYS) {
    if (needs[k] >= PET_REQUEST_THRESHOLD) continue;
    if (worst === null || needs[k] < needs[worst]) worst = k;
  }
  return worst ? REQUEST_FOR_NEED[worst] : null;
}

/**
 * Office hours to catch up after the office was closed for `elapsedMs`.
 * Needs decay at PET_OFFLINE_DECAY_FACTOR while closed, capped, so a weekend
 * away costs at most PET_OFFLINE_MAX_CATCHUP_HOURS of normal decay.
 */
export function offlineCatchUpHours(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  const hours = (elapsedMs / 3_600_000) * PET_OFFLINE_DECAY_FACTOR;
  return Math.min(hours, PET_OFFLINE_MAX_CATCHUP_HOURS);
}
