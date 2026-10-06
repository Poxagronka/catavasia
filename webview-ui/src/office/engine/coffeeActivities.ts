/**
 * The coffee corner (catalog tab "Coffee", art from
 * scripts/generate-coffee-sprites.mjs) as a chain of idle activities:
 *
 *   brew          walk to a machine, press it, wait while it brews (the
 *                 machine plays its frames), take the full cup
 *   coffeeSip     carry the cup to a free sofa seat or coffee-table spot,
 *                 blow on it and sip (the machine shows no cup meanwhile)
 *   coffeeReturn  carry the cup back to the machine and put it down
 *
 * Only `brew` is picked by the weighted pool; the other two follow it
 * (`next`). Every step reserves its spot like any idle activity. Pets never
 * take part (petActivities.ts names no coffee activity).
 */

import type { AnimParts } from './activityAnim.js';
import { st } from './activityAnim.js';
import { adjacentSpots, floorNear, itemsOfType, seatSpots } from './activitySpots.js';
import type { IdleActivityDef } from './idleActivities.js';
import { SIP } from './idleAnims.js';

/** Machines a cat brews at (frames: see scripts/coffee/coffeeArt.mjs). */
export const COFFEE_MACHINE_TYPES = [
  'ESPRESSO_MACHINE',
  'DRIP_COFFEE_MAKER',
  'POUR_OVER',
  'FRENCH_PRESS',
  'MOKA_POT',
  'ELECTRIC_KETTLE',
] as const;

/** Machine frame while its cup is out (coffeeArt.mjs frame 6). */
export const CUP_OUT_FRAME = 6;

const SOFA_TYPES = ['SOFA_FRONT', 'SOFA_BACK', 'SOFA_SIDE'] as const;
const TABLE_TYPES = ['COFFEE_TABLE'] as const;

/** Steam over the cup held at the machine (frame px per facing). */
const CUP_STEAM = { down: [8, 17], up: [14, 10], side: [13, 16] } as const;

const BREW: AnimParts = {
  intro: [
    st('brewReach', 0.35),
    st('brewPress', 0.25, { item: 1 }),
    st('brewReach', 0.2, { item: 1 }),
    st('brewWaitA', 0.5, { item: 2 }),
    st('brewWaitB', 0.45, { item: 2 }),
    st('brewWaitA', 0.5, { item: 3 }),
    st('brewWaitB', 0.45, { item: 3 }),
    st('brewWaitA', 0.5, { item: 4 }),
    st('brewWaitB', 0.4, { item: 4 }),
    st('brewWaitA', 0.5, {
      item: 5,
      fx: 'sparkle',
      fxAt: { down: [8, 36], up: [8, 10], side: [23, 22] },
    }),
    st('brewReach', 0.25, { item: 5 }),
  ],
  loop: [st('brewTake', 0.6, { item: CUP_OUT_FRAME, fx: 'steam', fxAt: CUP_STEAM })],
};

const RETURN: AnimParts = {
  loop: [
    st('brewTake', 0.3, { item: CUP_OUT_FRAME }),
    st('cupPut', 0.4, { item: CUP_OUT_FRAME }),
    st('stand', 0.35),
  ],
};

const machineSpots: IdleActivityDef['spots'] = (ctx) =>
  adjacentSpots(ctx, itemsOfType(ctx, COFFEE_MACHINE_TYPES), { nudgePx: 3 });

export const COFFEE_ACTIVITIES: IdleActivityDef[] = [
  {
    id: 'brew',
    // The most visible idle: cats making coffee was the user's ask (2026-10-06).
    weight: 4,
    durationSec: [0, 0],
    ...BREW,
    spots: machineSpots,
    next: 'coffeeSip',
  },
  {
    id: 'coffeeSip',
    weight: 0,
    durationSec: [10, 18],
    ...SIP,
    spots: (ctx) => [
      ...seatSpots(ctx, itemsOfType(ctx, SOFA_TYPES)),
      ...adjacentSpots(ctx, itemsOfType(ctx, TABLE_TYPES)),
    ],
    fallbackSpots: (ctx) => floorNear(ctx, itemsOfType(ctx, [...SOFA_TYPES, ...TABLE_TYPES])),
    carry: true,
    next: 'coffeeReturn',
  },
  {
    id: 'coffeeReturn',
    weight: 0,
    durationSec: [0, 0],
    ...RETURN,
    spots: machineSpots,
    carry: true,
  },
];
