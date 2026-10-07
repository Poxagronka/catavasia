/**
 * Pet naps ON desks and tables (catalog category "desks"): one spot on the
 * top of each item, where no surface item (a PC, a laptop, a mug, a plant)
 * stands. Agent cats work at these items and never nap on them: the activity
 * has weight 0, so only pets claim it (engine/petActivities.ts). Each table
 * kind has its own pet animation (PET_DESK_ANIM_OF, steps in petDeskAnims.ts).
 *
 * The numbers come from the art (public/assets/furniture/<KIND>/*.png): where
 * a cat's feet rest on the top, per view. The first candidate that no surface
 * item covers wins.
 */

import { PET_SIDE_POSE_HALF_PX } from '../../constants.js';
import { furnitureKind, getCatalogEntry } from '../layout/furnitureCatalog.js';
import { isWalkable } from '../layout/tileMap.js';
import type { ActivitySpot, PetDeskAnim, PlacedFurniture } from '../types.js';
import { Direction, TILE_SIZE } from '../types.js';
import type { OnItemPose, SpotContext } from './activitySpots.js';
import { footprint, itemsOfType, onItemSpots } from './activitySpots.js';
import type { IdleActivityDef } from './idleActivities.js';
import { NAP } from './idleAnims.js';
import { PET_DESK_WALK_PX } from './petDeskAnims.js';

export const DESK_NAP_ID = 'deskNap';

/** Places on the top, best first: px from the bottom tile's centre (see onItemSpots). */
const DESK_NAP_POSES: Readonly<Record<string, readonly OnItemPose[]>> = {
  DESK: [
    { front: { offsetX: 16, offsetY: -4 }, side: { offsetX: 0, offsetY: -10 } },
    { front: { offsetX: 2, offsetY: -4 }, side: { offsetX: 0, offsetY: -22 } },
    { front: { offsetX: 30, offsetY: -4 }, side: { offsetX: 0, offsetY: -34 } },
  ],
  // The papers and the keyboard between the lamps and monitors: a cat's favourite bed.
  EXECUTIVE_DESK: [
    {
      front: { offsetX: 16, offsetY: -6 },
      side: { offsetX: 8, offsetY: -10 },
      back: { offsetX: 16, offsetY: -6 },
    },
  ],
  LEAD_DESK: [
    {
      front: { offsetX: 16, offsetY: -5 },
      side: { offsetX: 4, offsetY: -4 },
      back: { offsetX: 16, offsetY: -6 },
    },
  ],
  TABLE_FRONT: [
    { front: { offsetX: 16, offsetY: -16 }, side: { offsetX: 24, offsetY: -10 } },
    { front: { offsetX: 16, offsetY: -28 }, side: { offsetX: 8, offsetY: -10 } },
    { front: { offsetX: 2, offsetY: -16 }, side: { offsetX: 40, offsetY: -10 } },
    { front: { offsetX: 30, offsetY: -16 }, side: { offsetX: 24, offsetY: -20 } },
  ],
  SMALL_TABLE: [
    { front: { offsetX: 8, offsetY: -4 }, side: { offsetX: 1, offsetY: -10 } },
    { front: { offsetX: 2, offsetY: -4 }, side: { offsetX: 1, offsetY: -20 } },
    { front: { offsetX: 14, offsetY: -4 }, side: { offsetX: 1, offsetY: -2 } },
  ],
  COFFEE_TABLE: [
    { front: { offsetX: 8, offsetY: -4 } },
    { front: { offsetX: 8, offsetY: -12 } },
    { front: { offsetX: 2, offsetY: -4 } },
    { front: { offsetX: 14, offsetY: -4 } },
  ],
};

/** The pet's nap animation on each table kind. */
export const PET_DESK_ANIM_OF: Readonly<Record<string, PetDeskAnim>> = {
  DESK: 'deskLoaf',
  EXECUTIVE_DESK: 'deskLoaf',
  LEAD_DESK: 'deskLoaf',
  TABLE_FRONT: 'tableSprawl',
  SMALL_TABLE: 'tableDonut',
  COFFEE_TABLE: 'coffeeSprawl',
};

/** Half the px width and the px height a napping cat covers on the top. */
const CAT_HALF_W = 6;
const CAT_H = 12;

/** Tile rects (world px) of every surface item: what stands on a table top. */
function surfaceRects(ctx: SpotContext): Array<{ x: number; y: number }> {
  return ctx.furniture.flatMap((f) => {
    const e = getCatalogEntry(f.type);
    if (!e?.canPlaceOnSurfaces) return [];
    const out: Array<{ x: number; y: number }> = [];
    for (let r = 0; r < e.footprintH; r++)
      for (let c = 0; c < e.footprintW; c++)
        out.push({ x: (f.col + c) * TILE_SIZE, y: (f.row + r) * TILE_SIZE });
    return out;
  });
}

/** True when a surface item's tile overlaps where the cat would lie. */
function covered(spot: ActivitySpot, rects: Array<{ x: number; y: number }>): boolean {
  const cx = spot.col * TILE_SIZE + TILE_SIZE / 2 + spot.offsetX;
  const feet = spot.row * TILE_SIZE + TILE_SIZE / 2 + spot.offsetY;
  return rects.some(
    (t) =>
      t.x < cx + CAT_HALF_W &&
      t.x + TILE_SIZE > cx - CAT_HALF_W &&
      t.y < feet &&
      t.y + TILE_SIZE > feet - CAT_H,
  );
}

/**
 * The spot moved to the bottom-row tile nearest the pose that the cat can
 * step onto from free floor (the pose stays where it is). The bottom row
 * keeps the cat sorted with the item. Null when no such tile exists.
 */
function reachableAnchor(ctx: SpotContext, item: PlacedFurniture, spot: ActivitySpot) {
  const poseCol = spot.col + Math.round(spot.offsetX / TILE_SIZE);
  const cols = footprint(item)
    .filter((t) => t.row === spot.row)
    .map((t) => t.col)
    .sort((a, b) => Math.abs(a - poseCol) - Math.abs(b - poseCol));
  const own = new Set(footprint(item).map((t) => `${t.col},${t.row}`));
  const open = (c: number, r: number) =>
    !own.has(`${c},${r}`) && isWalkable(c, r, ctx.tileMap, ctx.blockedTiles);
  const col = cols.find((c) => STEPS.some(([dc, dr]) => open(c + dc, spot.row + dr)));
  if (col === undefined) return null;
  const offsetX = spot.offsetX + (spot.col - col) * TILE_SIZE;
  return { ...spot, key: `${col},${spot.row}`, col, offsetX };
}

const STEPS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [-1, 0],
  [1, 0],
  [0, -1],
];

/**
 * True when a sideways cat at the spot (and on its walk along the top) would
 * stick out past the item's sprite: the pet walks and naps lengthwise there.
 */
function isNarrow(item: PlacedFurniture, spot: ActivitySpot): boolean {
  const w = getCatalogEntry(item.type)?.sprite[0]?.length ?? TILE_SIZE;
  const cx = (spot.col - item.col) * TILE_SIZE + TILE_SIZE / 2 + spot.offsetX;
  const walk = PET_DESK_WALK_PX[petDeskAnimFor(item.type)];
  // A mirrored item walks the other way: room on both sides.
  return cx - walk - PET_SIDE_POSE_HALF_PX < 0 || cx + walk + PET_SIDE_POSE_HALF_PX > w;
}

/** One free place on the top of each desk or table, or none when every candidate is covered. */
export function deskNapSpots(ctx: SpotContext): ActivitySpot[] {
  const rects = surfaceRects(ctx);
  const out: ActivitySpot[] = [];
  for (const [kind, poses] of Object.entries(DESK_NAP_POSES)) {
    for (const item of itemsOfType(ctx, [kind])) {
      const free = poses
        .map((pose) => onItemSpots([item], pose)[0])
        .find((spot) => !covered(spot, rects));
      const spot = free && reachableAnchor(ctx, item, free);
      // The cat faces the viewer on every top, however the item is turned: it hops up from the front.
      if (!spot) continue;
      out.push({
        ...spot,
        facing: Direction.DOWN,
        ...(isNarrow(item, spot) ? { narrow: true } : {}),
      });
    }
  }
  return out;
}

/** The nap animation for the item a desk nap is on (the work-desk loaf by default). */
export function petDeskAnimFor(type: string | undefined): PetDeskAnim {
  return (type && PET_DESK_ANIM_OF[furnitureKind(type)]) || 'deskLoaf';
}

export const DESK_NAP_ACTIVITY: IdleActivityDef = {
  id: DESK_NAP_ID,
  // Pets only: agent cats work at desks, they never pick this.
  weight: 0,
  durationSec: [25, 60],
  ...NAP,
  spots: deskNapSpots,
  zzz: true,
};
