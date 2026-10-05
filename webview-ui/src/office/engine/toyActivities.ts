/**
 * Cat toys as idle activities. Each toy is plain furniture (category "toys",
 * art from scripts/generate-toy-sprites.mjs) plus one entry here: where the
 * cat goes, which frames it plays, how the toy moves. They join the same
 * weighted pool as coffee and naps.
 *
 * Frame numbers are idle frames (sheet frame - 7; see scripts/cats/):
 * 2-4 nap, 5-6 scratch, 7-8 bat, 9-10 box peek, 11-12 sit,
 * 13-14 pounce, 15-16 jump.
 */

import { adjacentSpots, itemsOfType, onItemSpots, throughSpots } from './activitySpots.js';
import type { IdleActivityDef } from './idleActivities.js';

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
    frames: [5, 6],
    frameSec: 0.22,
    spots: (ctx) =>
      adjacentSpots(ctx, itemsOfType(ctx, ['SCRATCHING_POST']), {
        sides: 'horizontal',
        nudgePx: 7,
      }),
  },
  {
    id: 'yarn',
    weight: 1,
    durationSec: [6, 12],
    frames: [7, 7, 8, 8, 7, 8],
    frameSec: 0.3,
    spots: (ctx) =>
      adjacentSpots(ctx, itemsOfType(ctx, ['YARN_BALL']), { sides: 'horizontal', nudgePx: 4 }),
    prop: 'roll',
  },
  {
    id: 'box',
    weight: 1,
    durationSec: [12, 25],
    frames: [9, 9, 9, 10],
    frameSec: 0.7,
    spots: (ctx) => onItemSpots(itemsOfType(ctx, ['CARDBOARD_BOX']), 0, BOX_OFFSET_Y),
  },
  {
    id: 'catTree',
    weight: 1,
    durationSec: [15, 30],
    frames: [11, 11, 11, 11, 12],
    frameSec: 0.8,
    spots: (ctx) =>
      onItemSpots(itemsOfType(ctx, ['CAT_TREE']), TREE_TOP_OFFSET_X, TREE_TOP_OFFSET_Y),
  },
  {
    id: 'tunnel',
    weight: 1,
    durationSec: [20, 20],
    frames: [],
    frameSec: 0.1,
    spots: (ctx) => throughSpots(ctx, itemsOfType(ctx, ['PLAY_TUNNEL'])),
    walkAnim: true,
  },
  {
    id: 'mouse',
    weight: 1,
    durationSec: [6, 12],
    frames: [13, 13, 14, 13, 13, 14, 14],
    frameSec: 0.25,
    spots: (ctx) =>
      adjacentSpots(ctx, itemsOfType(ctx, ['TOY_MOUSE']), { sides: 'horizontal', nudgePx: 4 }),
    prop: 'dart',
  },
  {
    id: 'teaser',
    weight: 1,
    durationSec: [6, 12],
    frames: [15, 15, 16, 16],
    frameSec: 0.3,
    spots: (ctx) =>
      adjacentSpots(ctx, itemsOfType(ctx, ['FEATHER_TEASER']), { sides: 'left', nudgePx: 4 }),
    prop: 'sway',
  },
  {
    id: 'catBed',
    weight: 1,
    durationSec: [25, 50],
    frames: [2, 3, 2, 4],
    frameSec: 0.9,
    spots: (ctx) => onItemSpots(itemsOfType(ctx, ['CAT_BED']), 0, BED_OFFSET_Y),
    zzz: true,
    lowPosePx: 12,
  },
];
