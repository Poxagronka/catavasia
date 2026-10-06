/**
 * Litter boxes as idle activities for agent cats (pets go through
 * petCare/petCareSystem.ts). A visit is a rare need (LITTER_ACTIVITY_WEIGHT):
 * an open box plays LITTER_USE on the box tile, a hooded one hides the cat
 * inside. The follow-ups — the refusal of an overflowing box, an accident on
 * the floor, the zoomies — are never picked: engine/litterLife.ts starts
 * them. The box tile is the spot, so one cat uses a box at a time.
 */

import { LITTER_ACTIVITY_WEIGHT } from '../../constants.js';
import { boxPose, isLitterBoxType } from '../petCare/litterStages.js';
import { isHoodedLitterBox } from '../sprites/petCareSprites.js';
import type { ActivitySpot } from '../types.js';
import { Direction } from '../types.js';
import type { SpotContext } from './activitySpots.js';
import type { IdleActivityDef } from './idleActivities.js';
import {
  LITTER_FLOOR,
  LITTER_HOOD_USE,
  LITTER_REFUSE,
  LITTER_USE,
  ZOOMIES_SKID,
} from './litterAnims.js';

export const LITTER_USE_IDS = ['litter', 'litterHood'] as const;

/** The box tile itself, facing right (the side-view dig and squat), drawn per boxPose. */
function boxSpots(ctx: SpotContext, hooded: boolean): ActivitySpot[] {
  return ctx.furniture
    .filter((f) => isLitterBoxType(f.type) && isHoodedLitterBox(f.type) === hooded)
    .map((f) => {
      const { offsetY, peek } = boxPose(f);
      return {
        key: `${f.col},${f.row}`,
        col: f.col,
        row: f.row,
        facing: hooded ? Direction.DOWN : Direction.RIGHT,
        onFurniture: false,
        itemUid: f.uid,
        offsetX: 0,
        offsetY,
        ...(peek ? { peek } : {}),
      };
    });
}

export const LITTER_ACTIVITIES: IdleActivityDef[] = [
  {
    id: 'litter',
    weight: LITTER_ACTIVITY_WEIGHT,
    durationSec: [0, 0],
    ...LITTER_USE,
    spots: (ctx) => boxSpots(ctx, false),
  },
  {
    id: 'litterHood',
    weight: LITTER_ACTIVITY_WEIGHT,
    durationSec: [0, 0],
    ...LITTER_HOOD_USE,
    spots: (ctx) => boxSpots(ctx, true),
    peekOnHide: true,
  },
  // Started by litterLife.ts only (weight 0: never picked).
  { id: 'litterRefuse', weight: 0, durationSec: [0, 0], ...LITTER_REFUSE, peekOnHide: true },
  { id: 'litterFloor', weight: 0, durationSec: [0, 0], ...LITTER_FLOOR },
  { id: 'zoomies', weight: 0, durationSec: [0, 0], ...ZOOMIES_SKID, sprint: true },
];
