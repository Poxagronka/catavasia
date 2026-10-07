/**
 * A cat pet's nap ON a table top, one animation per table kind: it hops up
 * from the floor in front, walks back onto the top, settles and sleeps,
 * then jumps down. Steps as in petPlayAnims.ts.
 *
 * Heights: a step's `drop` draws the pose that fraction of the way from the
 * table top (the spot) down to the floor line in front of the item, so the
 * hop matches every table's own height in every view.
 */

import type { PetPoseName } from '../sprites/petPlayFrames.js';
import type { PetDeskAnim } from '../types.js';
import type { PetAnim, PetStep } from './petPlayAnims.js';

const s = (pose: PetStep['pose'], sec: number, extra: Omit<PetStep, 'pose' | 'sec'> = {}) => ({
  pose,
  sec,
  ...extra,
});

/** Px each nap walks along the top before it settles (the hop lands this far behind the spot). */
export const PET_DESK_WALK_PX: Readonly<Record<PetDeskAnim, number>> = {
  deskLoaf: 4,
  tableSprawl: 8,
  tableDonut: 0,
  coffeeSprawl: 2,
};

/**
 * On a narrow top (a desk's side view) a sideways pose would stick out past
 * both edges: the walk runs lengthwise (step dx becomes a walk up the top,
 * back view), and every wide pose turns into a front-view one.
 */
export const NARROW_POSE: Readonly<Partial<Record<PetPoseName, PetPoseName>>> = {
  stepA: 'climbA',
  stepB: 'climbB',
  faceLeft: 'faceUp',
  bow: 'crouch',
  sprawlA: 'perch',
  sprawlB: 'loafBreath',
  bellyUp: 'perch',
  longA: 'perch',
  longB: 'loafBreath',
  longTwitch: 'perch',
};

/** Px the cat rises above its path at the top of a hop. */
const ARC = 4;

/** From the floor in front: crouch, spring, land on the front edge, walk back to the spot. */
const HOP_UP: readonly PetStep[] = [
  s('faceDown', 0.3, { drop: 1 }),
  s('crouch', 0.25, { drop: 1 }),
  s('pounce', 0.1, { drop: 0.7, dy: -ARC }),
  s('pounce', 0.1, { drop: 0.45, dy: -ARC / 2 }),
  s('crouch', 0.15, { drop: 0.35 }),
  s('climbA', 0.18, { drop: 0.25 }),
  s('climbB', 0.18, { drop: 0.15 }),
  s('climbA', 0.18, { drop: 0.05 }),
];

/** Up, a stretch and off the front edge: dust where it lands. */
const HOP_DOWN: readonly PetStep[] = [
  s('faceDown', 0.4),
  s('crouch', 0.25, { drop: 0.1 }),
  s('pounce', 0.1, { drop: 0.4, dy: -ARC }),
  s('pounce', 0.1, { drop: 0.75, dy: -ARC / 2 }),
  s('crouch', 0.3, { drop: 1, fx: 'dust', fxAt: [0, 0] }),
];

/** The hop up `from` px behind the spot, then a walk along the top (toward the facing) onto it. */
const upAndCrawl = (from: number): PetStep[] => [
  ...HOP_UP.map((st) => ({ ...st, dx: from })),
  ...Array.from({ length: Math.abs(from) / 2 }, (_, i) =>
    s(i % 2 ? 'stepB' : 'stepA', 0.14, { dx: from + Math.sign(-from) * 2 * i }),
  ),
];

const knead = (n: number): PetStep[] =>
  Array.from({ length: n * 2 }, (_, i) => s(i % 2 ? 'kneadB' : 'kneadA', 0.18));

export const PET_DESK_ANIMS: Readonly<Record<PetDeskAnim, PetAnim>> = {
  // Work desks: knead the papers, loaf by the monitor, a look at the screen now and then.
  deskLoaf: {
    intro: [
      ...upAndCrawl(-PET_DESK_WALK_PX.deskLoaf),
      s('perch', 0.3),
      ...knead(3),
      s('perch', 0.4),
    ],
    loop: [
      s('perch', 1.6),
      s('loafBreath', 1.6),
      s('perch', 1.4),
      s('perchL', 0.6),
      s('perch', 0.4),
      s('loafBreath', 1.6),
    ],
    outro: HOP_DOWN,
    nap: true,
  },
  // The big table: a long walk across, a stretch, a flop on the side, now and then belly up.
  tableSprawl: {
    intro: [...upAndCrawl(-PET_DESK_WALK_PX.tableSprawl), s('bow', 0.8), s('sprawlA', 0.4)],
    loop: [
      s('sprawlA', 1.4),
      s('sprawlB', 1.4),
      s('sprawlA', 1.4),
      s('bellyUp', 1.6),
      s('sprawlB', 1.4),
    ],
    outro: HOP_DOWN,
    nap: true,
  },
  // The small round table: turn round once, curl into a tight donut.
  tableDonut: {
    intro: [
      ...HOP_UP,
      s('faceLeft', 0.2),
      s('faceUp', 0.2),
      s('stepA', 0.2),
      s('faceDown', 0.2),
      s('faceLeft', 0.2),
      s('faceUp', 0.2),
      s('stepA', 0.2),
      s('donutA', 0.4),
    ],
    loop: [s('donutA', 1.5), s('donutB', 1.5)],
    outro: HOP_DOWN,
    nap: true,
  },
  // The low coffee table: a short walk, a long stretch, stretched out with a paw twitch.
  coffeeSprawl: {
    intro: [...upAndCrawl(-PET_DESK_WALK_PX.coffeeSprawl), s('bow', 1.0), s('longA', 0.4)],
    loop: [
      s('longA', 1.4),
      s('longB', 1.4),
      s('longTwitch', 0.15),
      s('longA', 0.15),
      s('longTwitch', 0.15),
      s('longA', 1.2),
      s('longB', 1.4),
    ],
    outro: HOP_DOWN,
    nap: true,
  },
};
