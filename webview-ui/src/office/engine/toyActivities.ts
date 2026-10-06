/**
 * Cat toys as idle activities. Each toy is plain furniture (category "toys",
 * art from scripts/generate-toy-sprites.mjs) plus one entry here: where the
 * cat goes, which poses it plays (see toyAnims.ts), how the toy moves. They
 * join the same weighted pool as coffee and naps.
 */

import type { OnItemPose } from './activitySpots.js';
import { adjacentSpots, itemsOfType, onItemSpots, throughSpots } from './activitySpots.js';
import type { IdleActivityDef } from './idleActivities.js';
import { NAP } from './idleAnims.js';
import { BOX, CAT_TREE, MOUSE, SCRATCH, TEASER, TUNNEL, YARN } from './toyAnims.js';

/** Where a pose sits on the toy sprite, front view (see the toy art templates). */
const TREE_TOP: OnItemPose = { front: { offsetX: 8, offsetY: -31 } };
const IN_BOX: OnItemPose = { front: { offsetX: 0, offsetY: 8 } };
const ON_BED: OnItemPose = { front: { offsetX: 0, offsetY: 5 } };

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
    spots: (ctx) => onItemSpots(itemsOfType(ctx, ['CARDBOARD_BOX']), IN_BOX),
  },
  {
    id: 'catTree',
    weight: 1,
    durationSec: [15, 30],
    ...CAT_TREE,
    spots: (ctx) => onItemSpots(itemsOfType(ctx, ['CAT_TREE']), TREE_TOP),
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
      // The wand bends to the item's left: the cat plays on that side, however it is turned.
      adjacentSpots(ctx, itemsOfType(ctx, ['FEATHER_TEASER']), { itemSides: ['left'] }),
    prop: 'sway',
  },
  {
    id: 'catBed',
    weight: 1,
    durationSec: [25, 50],
    ...NAP,
    spots: (ctx) => onItemSpots(itemsOfType(ctx, ['CAT_BED']), ON_BED),
    zzz: true,
    lowPosePx: 12,
  },
];
