/**
 * Cat beds and cat houses (catalog tab "Cat beds", art from
 * scripts/generate-bed-sprites.mjs) as idle activities: an agent cat naps ON
 * a bed, or INSIDE a house where only its ears or its tail show. They join
 * the weighted pool next to the sofa nap. Pets use the same spots for their
 * naps (engine/petActivities.ts).
 *
 * The per-type numbers come from the art (scripts/beds/*.mjs): where a curled
 * cat lies on each bed, and where its ears or tail peek out of each house.
 */

import { getCatalogEntry } from '../layout/furnitureCatalog.js';
import type { ActivitySpot, HousePeek } from '../types.js';
import { TILE_SIZE } from '../types.js';
import type { SpotContext } from './activitySpots.js';
import { itemsOfType, onItemSpots } from './activitySpots.js';
import type { IdleActivityDef } from './idleActivities.js';
import { HOUSE_NAP, NAP } from './idleAnims.js';

/** Where a curled cat lies on a bed: px from the bottom tile's centre (see onItemSpots). */
export const BED_POSES: Readonly<Record<string, { offsetX: number; offsetY: number }>> = {
  BED_CUSHION: { offsetX: 0, offsetY: 4 },
  BED_BASKET: { offsetX: 0, offsetY: 4 },
  BED_HAMMOCK: { offsetX: 0, offsetY: -3 },
  BED_DONUT: { offsetX: 0, offsetY: 4 },
};

/** What shows of a cat inside a house: its bottom-centre in px from the sprite's top-left. */
export const HOUSE_PEEKS: Readonly<
  Record<string, { kind: HousePeek['kind']; x: number; y: number }>
> = {
  HOUSE_CARDBOARD: { kind: 'ears', x: 8, y: 20 },
  HOUSE_IGLOO: { kind: 'tail', x: 8, y: 30 },
  HOUSE_WOODEN: { kind: 'tail', x: 8, y: 30 },
  HOUSE_CONDO: { kind: 'ears', x: 8, y: 18 },
};

export const BED_TYPES = Object.keys(BED_POSES);
export const HOUSE_TYPES = Object.keys(HOUSE_PEEKS);

function bedSpots(ctx: SpotContext): ActivitySpot[] {
  return BED_TYPES.flatMap((type) => {
    const pose = BED_POSES[type];
    return onItemSpots(itemsOfType(ctx, [type]), pose.offsetX, pose.offsetY);
  });
}

function houseSpots(ctx: SpotContext): ActivitySpot[] {
  return HOUSE_TYPES.flatMap((type) => {
    const p = HOUSE_PEEKS[type];
    const items = itemsOfType(ctx, [type]);
    return onItemSpots(items, 0, 0).map((spot, i) => {
      const item = items[i];
      const h = getCatalogEntry(item.type)?.footprintH ?? 1;
      const peek: HousePeek = {
        kind: p.kind,
        x: item.col * TILE_SIZE + p.x,
        y: item.row * TILE_SIZE + p.y,
        zY: (item.row + h) * TILE_SIZE + 1.5, // furniture sorts at +1
      };
      return { ...spot, peek };
    });
  });
}

export const BED_ACTIVITIES: IdleActivityDef[] = [
  {
    id: 'bed',
    weight: 1,
    durationSec: [25, 60],
    ...NAP,
    spots: bedSpots,
    zzz: true,
    lowPosePx: 12,
  },
  {
    id: 'house',
    weight: 1,
    durationSec: [25, 60],
    ...HOUSE_NAP,
    spots: houseSpots,
    zzz: true,
    lowPosePx: 12,
  },
];
