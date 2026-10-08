/**
 * Personality presets: multipliers of the idle tuning per cat
 * (CAT_PERSONALITY_TUNING in constants.ts). A cat without one gets 1 for
 * every knob, so it behaves exactly as before.
 *
 * Pure module: no DOM, no OfficeState.
 */

import type { CatPersonality } from '../../../../core/src/messages.js';
import { CAT_PERSONALITY_TUNING, type PersonalityKnob } from '../../constants.js';

export function personalityMul(p: CatPersonality | undefined, knob: PersonalityKnob): number {
  return (p && CAT_PERSONALITY_TUNING[p][knob]) ?? 1;
}

/**
 * The multiplier of a pair of cats: the stronger trait wins (the one further
 * from 1 on a log scale). One scrappy cat makes any pair fight more; one
 * social cat calms a pair with a default cat.
 */
export function pairMul(
  a: CatPersonality | undefined,
  b: CatPersonality | undefined,
  knob: PersonalityKnob,
): number {
  const ma = personalityMul(a, knob);
  const mb = personalityMul(b, knob);
  return Math.abs(Math.log(ma)) >= Math.abs(Math.log(mb)) ? ma : mb;
}

const KNOB_OF_ACTIVITY: Record<string, PersonalityKnob> = {
  wander: 'wander',
  tailChase: 'tailChase',
  litter: 'litter',
  litterHood: 'litter',
  ...Object.fromEntries(
    ['scratch', 'yarn', 'box', 'catTree', 'tunnel', 'mouse', 'teaser'].map((id) => [id, 'play']),
  ),
  ...Object.fromEntries(
    ['sleep', 'bed', 'house', 'catBed', 'loaf', 'yawn'].map((id) => [id, 'sleep']),
  ),
};

/** Weight multiplier of an idle activity (agent cat) or a pet activity id. */
export function activityMul(p: CatPersonality | undefined, activityId: string): number {
  const knob = KNOB_OF_ACTIVITY[activityId];
  return knob ? personalityMul(p, knob) : 1;
}
