/**
 * Cat toys as idle activities. Each toy is plain furniture (category "toys",
 * art from scripts/generate-toy-sprites.mjs) plus one entry here: where the
 * cat goes, which poses it plays (see toyAnims.ts), how the toy moves. They
 * join the same weighted pool as coffee and naps.
 */

import { adjacentSpots, itemsOfType, onItemSpots, throughSpots } from './activitySpots.js';
import type { IdleActivityDef } from './idleActivities.js';
import { NAP } from './idleAnims.js';
import { BOX, CAT_TREE, MOUSE, SCRATCH, TEASER, TUNNEL, YARN } from './toyAnims.js';

/** Px offsets that put a pose on the toy sprite (see the toy art templates). */
const TREE_TOP_OFFSET_X = 8;
const TREE_TOP_OFFSET_Y = -31;
const BOX_OFFSET_Y = 8;
const BED_OFFSET_Y = 5;

export const TOY_ACTIVITIES: IdleActivityDef[] = [
  {
    id: 'scratch',
    weight: 1,
    durationSec: [8, 14],
    ...SCRATCH,
    spots: (ctx) =>
      adjacentSpots(ctx, itemsOfType(ctx, ['SCRATCHING_POST']), {
        sides: 'horizontal',
        nudgePx: 9,
      }),
  },
  {
    id: 'yarn',
    weight: 1,
    durationSec: [6, 12],
    ...YARN,
    spots: (ctx) =>
      adjacentSpots(ctx, itemsOfType(ctx, ['YARN_BALL']), { sides: 'horizontal', nudgePx: 4 }),
    prop: 'roll',
  },
  {
    id: 'box',
    weight: 1,
    durationSec: [12, 25],
    ...BOX,
    spots: (ctx) => onItemSpots(itemsOfType(ctx, ['CARDBOARD_BOX']), 0, BOX_OFFSET_Y),
  },
  {
    id: 'catTree',
    weight: 1,
    durationSec: [15, 30],
    ...CAT_TREE,
    spots: (ctx) =>
      onItemSpots(itemsOfType(ctx, ['CAT_TREE']), TREE_TOP_OFFSET_X, TREE_TOP_OFFSET_Y),
  },
  {
    id: 'tunnel',
    weight: 1,
    durationSec: [20, 20],
    ...TUNNEL,
    spots: (ctx) => throughSpots(ctx, itemsOfType(ctx, ['PLAY_TUNNEL'])),
    walkAnim: true,
  },
  {
    id: 'mouse',
    weight: 1,
    durationSec: [6, 12],
    ...MOUSE,
    spots: (ctx) =>
      adjacentSpots(ctx, itemsOfType(ctx, ['TOY_MOUSE']), { sides: 'horizontal', nudgePx: 4 }),
    prop: 'dart',
  },
  {
    id: 'teaser',
    weight: 1,
    durationSec: [6, 12],
    ...TEASER,
    spots: (ctx) =>
      adjacentSpots(ctx, itemsOfType(ctx, ['FEATHER_TEASER']), { sides: 'left', nudgePx: 0 }),
    prop: 'sway',
  },
  {
    id: 'catBed',
    weight: 1,
    durationSec: [25, 50],
    ...NAP,
    spots: (ctx) => onItemSpots(itemsOfType(ctx, ['CAT_BED']), 0, BED_OFFSET_Y),
    zzz: true,
    lowPosePx: 12,
  },
];
