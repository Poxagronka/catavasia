/**
 * Step lists of the toy animations (see activityAnim.ts). Poses come from
 * scripts/cats/ by name; dx / dy move the pose, px / py move the toy in use,
 * fx adds effects. Every loop ends where it starts (pose, toy, offsets), so it
 * repeats without a jump.
 */

import type { AnimParts } from './activityAnim.js';
import { st } from './activityAnim.js';

/** Claw marks land on the sisal, just right of the paws. */
const SISAL: readonly [number, number] = [15, 21];

export const SCRATCH: AnimParts = {
  intro: [st('scrLook', 0.6), st('scrReach', 0.7)],
  loop: [
    st('scrA', 0.15, { fx: 'scratch', fxAt: SISAL }),
    st('scrB', 0.15, { dy: 1, fx: 'scratch', fxAt: SISAL }),
    st('scrA', 0.15, { fx: 'scratch', fxAt: SISAL }),
    st('scrB', 0.15, { dy: 1, fx: 'scratch', fxAt: SISAL }),
    st('scrA', 0.15, { fx: 'scratch', fxAt: SISAL }),
    st('scrB', 0.2, { dy: 1, fx: 'scratch', fxAt: SISAL }),
    st('scrPull', 0.6, { fx: 'fur', fxAt: [12, 22] }),
    st('scrReach', 0.8),
  ],
  outro: [st('scrLook', 0.8)],
};

const wiggle = (a: string, b: string, n: number, sec = 0.1) =>
  Array.from({ length: n * 2 }, (_, i) => st(i % 2 ? b : a, sec));

export const YARN: AnimParts = {
  intro: [st('yarnStalk', 0.5), ...wiggle('yarnWiggleA', 'yarnWiggleB', 2, 0.12)],
  loop: [
    st('yarnStalk', 0.4),
    ...wiggle('yarnWiggleA', 'yarnWiggleB', 2),
    st('yarnWindup', 0.22),
    st('yarnBat', 0.08, { px: 1 }),
    st('yarnBat', 0.12, { px: 3 }),
    st('yarnStalk', 0.12, { px: 4 }),
    st('yarnStalk', 0.3, { px: 5 }),
    st('yarnWindup', 0.15, { px: 5 }),
    st('yarnBat', 0.1, { px: 3 }),
    st('yarnBat', 0.1, { px: 1 }),
    st('yarnProud', 1.0, { fx: 'sparkle', fxAt: [11, 6] }),
  ],
};

export const MOUSE: AnimParts = {
  intro: [st('mouseStalk', 0.6)],
  loop: [
    st('mouseStalk', 0.5, { py: -1 }),
    st('mouseStalk', 0.3),
    ...wiggle('mouseWiggleA', 'mouseWiggleB', 3),
    st('mouseLeap', 0.12, { dy: -3, dx: 1, px: 1 }),
    st('mouseLeap', 0.1, { dy: -2, dx: 3, px: 1 }),
    st('mousePin', 0.5, { dx: 4, px: 1, fx: 'dust', fxAt: [13, 30] }),
    st('mouseGotIt', 0.9, { dx: 4, px: 1, fx: 'sparkle', fxAt: [11, 13] }),
    st('mousePin', 0.3, { dx: 4, px: 1 }),
    st('mouseStalk', 0.2, { dx: 3, px: 1 }),
    st('mouseStalk', 0.2, { dx: 2 }),
    st('mouseStalk', 0.2, { dx: 1 }),
    st('mouseStalk', 0.3),
  ],
};

export const TEASER: AnimParts = {
  intro: [st('teaserWatch', 0.5), st('teaserWatchUp', 0.4)],
  loop: [
    st('teaserWatchUp', 0.5, { py: -1 }),
    st('teaserRear', 0.3),
    st('teaserSwatA', 0.15, { px: 1 }),
    st('teaserRear', 0.12),
    st('teaserSwatB', 0.15, { px: -1, py: 1 }),
    st('teaserRear', 0.12),
    st('teaserHop', 0.12, { dy: -2, py: -1 }),
    st('teaserHop', 0.14, { dy: -3, px: 1 }),
    st('teaserHop', 0.1, { dy: -1 }),
    st('teaserGotIt', 0.5),
    st('teaserWatch', 0.7),
  ],
};

export const BOX: AnimParts = {
  intro: [
    st('boxHop', 0.1, { dy: -10 }),
    st('boxHop', 0.1, { dy: -6 }),
    st('boxSink', 0.25),
    st('boxPeek', 0.35),
    st('boxLow', 0.5),
  ],
  loop: [
    st('boxLow', 1.5),
    st('boxBlink', 0.15),
    st('boxLow', 1.0),
    st('boxLookL', 0.7),
    st('boxLookR', 0.7),
    st('boxLow', 0.4),
    st('boxTwitch', 0.2),
    st('boxLow', 0.3),
    st('boxTwitch', 0.2),
    st('boxLow', 1.2),
    st('boxPeek', 0.9),
    st('boxLow', 0.6),
  ],
  outro: [
    st('boxPeek', 0.3),
    st('boxSink', 0.2),
    st('boxHop', 0.1, { dy: -6 }),
    st('boxHop', 0.1, { dy: -2 }),
  ],
};

/** The loaf's belly line on the top platform (the tail hangs over its front). */
const ON_TOP = 1;

export const CAT_TREE: AnimParts = {
  intro: [
    st('climbA', 0.16, { dy: 31 }),
    st('climbB', 0.16, { dy: 25 }),
    st('climbA', 0.16, { dy: 19 }),
    st('climbB', 0.16, { dy: 13 }),
    st('climbA', 0.16, { dy: 7 }),
    st('treeLoaf', 0.4, { dy: ON_TOP }),
  ],
  loop: [
    st('treeLoaf', 1.0, { dy: ON_TOP }),
    st('treeLoafL', 0.45, { dy: ON_TOP }),
    st('treeLoaf', 0.35, { dy: ON_TOP }),
    st('treeLoafR', 0.45, { dy: ON_TOP }),
    st('treeLoaf', 0.8, { dy: ON_TOP }),
    st('treeBlink', 0.2, { dy: ON_TOP }),
    st('treeLoaf', 1.2, { dy: ON_TOP }),
    st('treeLook', 0.6, { dy: ON_TOP }),
    st('treeLoafR', 0.4, { dy: ON_TOP }),
    st('treeLoaf', 0.3, { dy: ON_TOP }),
    st('treeLoafL', 0.4, { dy: ON_TOP }),
  ],
  outro: [
    st('treeDrop', 0.1, { dy: 8 }),
    st('treeDrop', 0.1, { dy: 18 }),
    st('treeDrop', 0.12, { dy: 28, fx: 'dust', fxAt: [8, 30] }),
  ],
};

/** Crouch and wiggle at the opening, the run itself (runThrough.ts), then a proud pop-out. */
export const TUNNEL: AnimParts = {
  intro: [st('yarnStalk', 0.3), ...wiggle('yarnWiggleA', 'yarnWiggleB', 2)],
  loop: [],
  outro: [st('yarnProud', 0.9, { fx: 'sparkle', fxAt: [11, 6] })],
};
