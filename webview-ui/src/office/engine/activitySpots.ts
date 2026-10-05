/**
 * Spot builders for idle activities: which tiles next to, on, or through a
 * piece of furniture a cat can use. Pure functions of the layout.
 */

import { CHARACTER_SITTING_OFFSET_PX } from '../../constants.js';
import { getCatalogEntry } from '../layout/furnitureCatalog.js';
import { isWalkable } from '../layout/tileMap.js';
import type { ActivitySpot, PlacedFurniture, Seat, TileType as TileTypeVal } from '../types.js';
import { Direction } from '../types.js';

/** What spot builders read from the office. */
export interface SpotContext {
  furniture: PlacedFurniture[];
  seats: Map<string, Seat>;
  tileMap: TileTypeVal[][];
  blockedTiles: Set<string>;
}

const NEIGHBORS: ReadonlyArray<{ dc: number; dr: number; facing: Direction }> = [
  { dc: 0, dr: 1, facing: Direction.UP }, // spot below the item faces up
  { dc: 0, dr: -1, facing: Direction.DOWN },
  { dc: -1, dr: 0, facing: Direction.RIGHT },
  { dc: 1, dr: 0, facing: Direction.LEFT },
];

/** Type without the orientation suffix ("SOFA_SIDE:left" -> "SOFA_SIDE"). */
function baseType(type: string): string {
  return type.split(':')[0];
}

/** Furniture of the given types (orientation suffix ignored: "SOFA_SIDE:left" is SOFA_SIDE). */
export function itemsOfType(ctx: SpotContext, types: readonly string[]): PlacedFurniture[] {
  return ctx.furniture.filter((f) => types.includes(baseType(f.type)));
}

/** Tiles an item blocks: its footprint minus the walk-through background rows. */
export function footprint(item: PlacedFurniture): Array<{ col: number; row: number }> {
  const entry = getCatalogEntry(item.type);
  const w = entry?.footprintW ?? 1;
  const h = entry?.footprintH ?? 1;
  const bg = entry?.backgroundTiles ?? 0;
  const tiles: Array<{ col: number; row: number }> = [];
  for (let r = bg; r < h; r++)
    for (let c = 0; c < w; c++) tiles.push({ col: item.col + c, row: item.row + r });
  return tiles;
}

function seatAt(ctx: SpotContext, col: number, row: number): Seat | undefined {
  for (const seat of ctx.seats.values()) {
    if (seat.seatCol === col && seat.seatRow === row) return seat;
  }
  return undefined;
}

export interface AdjacentOptions {
  /** Which sides: every side, left/right only (side-view poses), or the left only. */
  sides?: 'all' | 'horizontal' | 'left';
  /** Draw the cat this many px toward the item (paws reach it). */
  nudgePx?: number;
}

/**
 * Tiles next to an item, facing it: free floor, or a seat (a sofa seat at the
 * coffee table). Each tile appears once even when it touches several items.
 */
export function adjacentSpots(
  ctx: SpotContext,
  items: PlacedFurniture[],
  opts: AdjacentOptions = {},
): ActivitySpot[] {
  const { sides = 'all', nudgePx = 0 } = opts;
  const dirs = NEIGHBORS.filter((n) =>
    sides === 'all' ? true : sides === 'horizontal' ? n.dr === 0 : n.dc === -1,
  );
  const out = new Map<string, ActivitySpot>();
  for (const item of items) {
    const tiles = footprint(item);
    const own = new Set(tiles.map((t) => `${t.col},${t.row}`));
    for (const t of tiles) {
      for (const n of dirs) {
        const col = t.col + n.dc;
        const row = t.row + n.dr;
        const key = `${col},${row}`;
        if (own.has(key) || out.has(key)) continue;
        const base = { key, col, row, facing: n.facing, itemUid: item.uid };
        const offsetX =
          n.facing === Direction.RIGHT ? nudgePx : n.facing === Direction.LEFT ? -nudgePx : 0;
        const seat = seatAt(ctx, col, row);
        if (seat) {
          out.set(key, {
            ...base,
            onFurniture: true,
            seatUid: seat.uid,
            offsetX,
            offsetY: CHARACTER_SITTING_OFFSET_PX,
          });
        } else if (isWalkable(col, row, ctx.tileMap, ctx.blockedTiles)) {
          out.set(key, { ...base, onFurniture: false, offsetX, offsetY: 0 });
        }
      }
    }
  }
  return [...out.values()];
}

/**
 * Seats of the items (sofa cushions). A seat that faces up sits behind the
 * backrest, which hides a low pose (a curled-up cat): skip those for them.
 */
export function seatSpots(
  ctx: SpotContext,
  items: PlacedFurniture[],
  lowPose = false,
): ActivitySpot[] {
  const uids = new Set(items.map((i) => i.uid));
  const out: ActivitySpot[] = [];
  for (const seat of ctx.seats.values()) {
    const itemUid = seat.uid.split(':')[0];
    if (!uids.has(itemUid)) continue;
    if (lowPose && seat.facingDir === Direction.UP) continue;
    out.push({
      key: `${seat.seatCol},${seat.seatRow}`,
      col: seat.seatCol,
      row: seat.seatRow,
      facing: seat.facingDir,
      onFurniture: true,
      seatUid: seat.uid,
      itemUid,
      offsetX: 0,
      offsetY: CHARACTER_SITTING_OFFSET_PX,
    });
  }
  return out;
}

/** Free floor within one tile of the items (diagonals too). */
export function floorNear(ctx: SpotContext, items: PlacedFurniture[]): ActivitySpot[] {
  const out = new Map<string, ActivitySpot>();
  for (const item of items) {
    for (const t of footprint(item)) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const col = t.col + dc;
          const row = t.row + dr;
          const key = `${col},${row}`;
          if (out.has(key) || !isWalkable(col, row, ctx.tileMap, ctx.blockedTiles)) continue;
          out.set(key, {
            key,
            col,
            row,
            facing: Direction.DOWN,
            onFurniture: false,
            offsetX: 0,
            offsetY: 0,
          });
        }
      }
    }
  }
  return [...out.values()];
}

/**
 * One spot ON each item (a box to sit in, a bed, the top of a cat tree): the
 * bottom-left blocked tile, drawn shifted by (offsetX, offsetY) px so the
 * pose lands where it belongs on the sprite.
 */
export function onItemSpots(
  items: PlacedFurniture[],
  offsetX: number,
  offsetY: number,
): ActivitySpot[] {
  return items.map((item) => {
    const tiles = footprint(item);
    const last = tiles[tiles.length - 1];
    const col = item.col;
    const row = last.row;
    return {
      key: `${col},${row}`,
      col,
      row,
      facing: Direction.DOWN,
      onFurniture: true,
      itemUid: item.uid,
      offsetX,
      offsetY,
    };
  });
}

/**
 * Ends of a horizontal tube (play tunnel): a spot at one free end, facing in,
 * with the opposite free end as its exit. Both ends must be floor.
 */
export function throughSpots(ctx: SpotContext, items: PlacedFurniture[]): ActivitySpot[] {
  const out: ActivitySpot[] = [];
  for (const item of items) {
    const tiles = footprint(item);
    const row = tiles[0].row;
    const left = Math.min(...tiles.map((t) => t.col)) - 1;
    const right = Math.max(...tiles.map((t) => t.col)) + 1;
    const walk = (c: number) => isWalkable(c, row, ctx.tileMap, ctx.blockedTiles);
    if (!walk(left) || !walk(right)) continue;
    const spot = (col: number, exit: number, facing: Direction): ActivitySpot => ({
      key: `${col},${row}`,
      col,
      row,
      facing,
      onFurniture: false,
      itemUid: item.uid,
      offsetX: 0,
      offsetY: 0,
      exit: { col: exit, row },
    });
    out.push(spot(left, right, Direction.RIGHT), spot(right, left, Direction.LEFT));
  }
  return out;
}
