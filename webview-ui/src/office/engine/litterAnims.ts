/**
 * Step lists of the litter animations (see activityAnim.ts): a box visit
 * (sniff, dig, squat, cover, proud), the same inside a hooded box (only the
 * tail shows while inside), the refusal of an overflowing box, an accident
 * on the floor, and the skid at the end of a zoomies dash. Poses come from
 * scripts/cats/litterPoses.mjs by name.
 */

import { Direction } from '../types.js';
import type { AnimParts, AnimStep } from './activityAnim.js';
import { st } from './activityAnim.js';

/** Behind the digging cat (frame px): the flung sand flies from here. */
const PAW: readonly [number, number] = [4, 27];
/** Over the head of the side squat (frame px): the strain marks. */
const ABOVE: readonly [number, number] = [9, 7];
/** The foot of a hooded box's doorway, from the cat's spot (frame px; below the frame). */
const DOOR: readonly [number, number] = [9, 33];
/** Just over the head of a front sit (frame px). */
const HEAD = { down: [8, 5], up: [8, 5], side: [9, 6] } as const;

const L = Direction.LEFT;
const R = Direction.RIGHT;

/** n scrapes of the paw, facing `dir`, kicking sand (or dust on the bare floor). */
function digs(n: number, dir: Direction, fx: 'sand' | 'dust' = 'sand'): AnimStep[] {
  return Array.from({ length: n * 2 }, (_, i) =>
    st(i % 2 ? 'litDigB' : 'litDigA', 0.13, { dir, fx, fxAt: PAW }),
  );
}

/** The squat: focus, a glance at whoever watches, the effort. */
const SQUAT: readonly AnimStep[] = [
  st('litSquat', 0.12, { dx: -1 }),
  st('litSquat', 0.12, { dx: 1 }),
  st('litSquat', 0.6),
  st('litShy', 0.7),
  st('litSquat', 0.35),
  st('litStrain', 0.5, { fx: 'effort', fxAt: ABOVE }),
  st('litStrain', 0.5, { dy: 1, fx: 'effort', fxAt: ABOVE }),
  st('litSquat', 0.45),
];

/** An open box: in, sniff, dig, squat, turn round and cover, sniff, proud. */
export const LITTER_USE: AnimParts = {
  intro: [st('litSniff', 0.55), st('litSniff', 0.3, { dx: 1 }), ...digs(4, R)],
  loop: SQUAT,
  outro: [
    ...digs(3, L),
    st('litSniff', 0.5, { dir: L }),
    st('litProud', 1.1, { dir: R, fx: 'sparkle', fxAt: [11, 6] }),
  ],
};

/**
 * A hooded box: in through the door, then only the face shows in it (hidden
 * steps; their pose picks the look: napOut eyes open, napFlick a blink) while the hood
 * wobbles (px) and sand flies out of the door; out again, proud.
 */
const inside = (sec: number, flick: boolean, extra: Omit<AnimStep, 'f' | 'sec'> = {}) =>
  st(flick ? 'napFlick' : 'napOut', sec, { hide: true, ...extra });

export const LITTER_HOOD_USE: AnimParts = {
  intro: [
    st('stand', 0.25, { dir: Direction.UP }),
    st('stand', 0.2, { dir: Direction.UP, dy: 3 }),
    inside(0.15, false, { px: 1 }),
    inside(0.15, false, { px: -1 }),
    ...[0, 1, 2, 3].map((i) => inside(0.15, false, { px: i % 2 ? -1 : 1, fx: 'sand', fxAt: DOOR })),
  ],
  loop: [
    inside(0.9, false),
    inside(0.25, true),
    inside(0.8, false, { fx: 'effort', fxAt: [8, 22] }),
    inside(0.25, true),
  ],
  outro: [
    ...[0, 1, 2].map((i) => inside(0.15, false, { px: i % 2 ? -1 : 1, fx: 'sand', fxAt: DOOR })),
    inside(0.3, false),
    st('sitHappy', 1.2, { dir: Direction.DOWN, fx: 'sparkle', fxAt: [12, 6] }),
  ],
};

/** An overflowing box: a sniff, a grimace, recoil, another grimace. */
export const LITTER_REFUSE: AnimParts = {
  intro: [st('litSniff', 0.6), st('litSniff', 0.25, { dy: -1 })],
  loop: [
    st('litGrimace', 0.45, { dir: Direction.DOWN, fx: 'grimace', fxAt: HEAD }),
    st('litRecoil', 0.4, { dir: Direction.DOWN, dy: -1, fx: 'grimace', fxAt: HEAD }),
    st('litGrimace', 0.7, { dir: Direction.DOWN, fx: 'grimace', fxAt: HEAD }),
  ],
};

/** No usable box: a look round, the squat on the bare floor, a token scratch, not me. */
export const LITTER_FLOOR: AnimParts = {
  intro: [st('litSniff', 0.45), st('litShy', 0.6)],
  loop: [st('litSquat', 0.6), st('litStrain', 0.8), st('litSquat', 0.3)],
  outro: [...digs(2, L, 'dust'), st('litSheepish', 1.3, { dir: Direction.DOWN })],
};

/** The end of a zoomies dash: a skid, a butt wiggle, a proud second. */
export const ZOOMIES_SKID: AnimParts = {
  intro: [
    st('yarnStalk', 0.25, { fx: 'dust', fxAt: [7, 30] }),
    st('yarnWiggleA', 0.1),
    st('yarnWiggleB', 0.1),
    st('yarnWiggleA', 0.1),
    st('yarnWiggleB', 0.1),
  ],
  loop: [st('yarnProud', 0.5)],
};
