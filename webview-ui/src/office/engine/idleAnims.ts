/**
 * Step lists of the idle animations: sipping coffee, napping (sofa, cat bed,
 * beds, houses) and the in-place idles (groom, yawn, stretch, tail chase,
 * loaf). Poses come from scripts/cats/ by name (see activityAnim.ts).
 */

import { Direction } from '../types.js';
import type { AnimParts, AnimStep } from './activityAnim.js';
import { st } from './activityAnim.js';

/** Steam rises from the mug: frame px per facing (front, back, side). */
const MUG_STEAM = { down: [8, 19], up: [14, 12], side: [12, 19] } as const;
const BLOW_AT = { down: [10, 17], up: [9, 10], side: [14, 16] } as const;

/** Holding a hot mug: steam, a blow on it, a long sip, an "ahh". */
export const SIP: AnimParts = {
  intro: [st('drinkHold', 0.7, { fx: 'steam', fxAt: MUG_STEAM })],
  loop: [
    st('drinkHold', 0.9, { fx: 'steam', fxAt: MUG_STEAM }),
    st('drinkBlow', 0.45, { fx: 'blow', fxAt: BLOW_AT }),
    st('drinkHold', 0.15),
    st('drinkBlow', 0.45, { fx: 'blow', fxAt: BLOW_AT }),
    st('drinkHold', 0.35, { fx: 'steam', fxAt: MUG_STEAM }),
    st('drinkSip', 1.3),
    st('drinkHappy', 1.0),
    st('drinkHold', 1.2, { fx: 'steam', fxAt: MUG_STEAM }),
  ],
};

/** Knead the spot, turn around once on it, settle into a loaf, then curl up. */
const NAP_INTRO: AnimStep[] = [
  ...Array.from({ length: 6 }, (_, i) => st(i % 2 ? 'kneadB' : 'kneadA', 0.22)),
  st('stand', 0.16, { dir: Direction.RIGHT }),
  st('stand', 0.16, { dir: Direction.UP }),
  st('stand', 0.16, { dir: Direction.LEFT }),
  st('stand', 0.16, { dir: Direction.DOWN }),
  st('loafHalf', 0.6, { dir: Direction.DOWN }),
  st('loafBlink', 0.5, { dir: Direction.DOWN }),
];

/** Slow breathing with a dream twitch of an ear and a lazy tail flick. */
const NAP_LOOP: AnimStep[] = [
  st('napOut', 1.5),
  st('napIn', 1.5),
  st('napOut', 1.5),
  st('napIn', 1.5),
  st('napTwitch', 0.2),
  st('napOut', 0.25),
  st('napTwitch', 0.2),
  st('napOut', 1.3),
  st('napIn', 1.5),
  st('napFlick', 0.6),
];

/** Waking up: a loaf with a blink, then a stretch up onto the feet. */
const NAP_OUTRO: AnimStep[] = [
  st('loafHalf', 0.5, { dir: Direction.DOWN }),
  st('yawnBig', 0.6, { dir: Direction.DOWN }),
  st('sitFront', 0.3, { dir: Direction.DOWN }),
];

export const NAP: AnimParts = { intro: NAP_INTRO, loop: NAP_LOOP, outro: NAP_OUTRO };

/** Inside a cat house only the ears or tail show: the same breathing, no knead. */
export const HOUSE_NAP: AnimParts = { loop: NAP_LOOP };

/** Washing the face: lick the paw, wipe over the eye, then behind the ear. */
export const GROOM: AnimParts = {
  intro: [st('sitFront', 0.4)],
  loop: [
    st('groomLick', 0.25),
    st('groomLick2', 0.2),
    st('groomLick', 0.25),
    st('groomLick2', 0.2),
    st('groomWipe', 0.3),
    st('groomEar', 0.3),
    st('groomWipe', 0.25),
    st('groomEar', 0.3),
    st('groomLick', 0.25),
    st('sitHappy', 0.6),
  ],
  outro: [st('sitHappy', 0.4)],
};

export const YAWN: AnimParts = {
  loop: [
    st('sitFront', 0.5),
    st('yawnOpen', 0.25),
    st('yawnBig', 1.1),
    st('yawnOpen', 0.15),
    st('yawnSmack', 0.35),
    st('sitHappy', 0.4),
    st('yawnSmack', 0.25),
    st('sitFront', 0.6),
  ],
};

/** Downward cat with a yawn, then the back-leg stretch. */
export const STRETCH: AnimParts = {
  loop: [
    st('stand', 0.3),
    st('stretchFront', 1.4),
    st('stand', 0.25),
    st('stretchBack', 0.9),
    st('stand', 0.5),
  ],
};

/** Spinning after the tail (flip, hop), then a dizzy sit with stars. */
export const TAIL_CHASE: AnimParts = {
  intro: [st('chaseA', 0.4, { dir: Direction.RIGHT })],
  loop: [
    ...Array.from({ length: 8 }, (_, i) =>
      st(i % 2 ? 'chaseB' : 'chaseA', 0.11, {
        dir: i % 2 ? Direction.LEFT : Direction.RIGHT,
        dy: i % 4 === 1 ? -2 : 0,
      }),
    ),
    st('chaseB', 0.3, { dir: Direction.RIGHT }),
  ],
  outro: [st('sitDizzy', 1.4, { dir: Direction.DOWN, fx: 'dizzy', fxAt: [8, 2] })],
};

/** A loaf: slow blinks and an ear twitch. */
export const LOAF: AnimParts = {
  loop: [
    st('loaf', 1.6),
    st('loafHalf', 1.2),
    st('loafBlink', 1.4),
    st('loafHalf', 0.8),
    st('loafTwitch', 0.2),
    st('loafHalf', 0.3),
    st('loafTwitch', 0.2),
    st('loaf', 1.0),
  ],
};
