/**
 * Spot builders for idle activities: which tiles next to, on, or through a
 * piece of furniture a cat can use. Pure functions of the layout.
 */

import { CHARACTER_SITTING_OFFSET_PX } from '../../constants.js';
import { furnitureKind, getCatalogEntry } from '../layout/furnitureCatalog.js';
import type { ItemSide } from '../layout/itemFrame.js';
import { artView, itemFrame, sideDirection, spriteX } from '../layout/itemFrame.js';
import { isWalkable } from '../layout/tileMap.js';
import type { ActivitySpot, PlacedFurniture, Seat, TileType as TileTypeVal } from '../types.js';
import { Direction, TILE_SIZE } from '../types.js';

/** What spot builders read from the office. */
export interface SpotContext {
  furniture: PlacedFurniture[];
  seats: Map<string, Seat>;
  tileMap: TileTypeVal[][];
  blockedTiles: Set<string>;
}

const OPPOSITE: Record<Direction, Direction> = {
  [Direction.DOWN]: Direction.UP,
  [Direction.UP]: Direction.DOWN,
  [Direction.LEFT]: Direction.RIGHT,
  [Direction.RIGHT]: Direction.LEFT,
};

const NEIGHBORS: ReadonlyArray<{ dc: number; dr: number; facing: Direction }> = [
  { dc: 0, dr: 1, facing: Direction.UP }, // spot below the item faces up
  { dc: 0, dr: -1, facing: Direction.DOWN },
  { dc: -1, dr: 0, facing: Direction.RIGHT },
  { dc: 1, dr: 0, facing: Direction.LEFT },
];

/**
 * Furniture of the given kinds (manifest ids: every view, state and mirror of
 * it) or exact view types ("SOFA_SIDE" also matches "SOFA_SIDE:left").
 */
export function itemsOfType(ctx: SpotContext, types: readonly string[]): PlacedFurniture[] {
  return ctx.furniture.filter(
    (f) => types.includes(furnitureKind(f.type)) || types.includes(f.type.split(':')[0]),
  );
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
  /** Screen sides: every side, or left/right only (side-view poses). */
  sides?: 'all' | 'horizontal';
  /** Item-local sides (front view) the cat may use; they turn and mirror with the item. */
  itemSides?: readonly ItemSide[];
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
  const { sides = 'all', itemSides, nudgePx = 0 } = opts;
  const screenDirs = NEIGHBORS.filter((n) => sides === 'all' || n.dr === 0);
  const out = new Map<string, ActivitySpot>();
  for (const item of items) {
    // A neighbour faces the item, so it stands on the side opposite its facing.
    const frame = itemFrame(item.type);
    const allowed = itemSides && new Set(itemSides.map((s) => sideDirection(frame, s)));
    const dirs = allowed ? screenDirs.filter((n) => allowed.has(OPPOSITE[n.facing])) : screenDirs;
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

/** A pose drawn ON an item: px from the centre of its bottom-left blocked tile. */
export interface PoseAt {
  offsetX: number;
  offsetY: number;
}

/**
 * Where a pose sits on an item, per art view (numbers of the unflipped art):
 * `side` is the right view (its mirror serves the left view), `back` the back
 * view; a view without its own numbers uses `front`. `facing`: the item-local
 * way the cat faces (default 'front', toward the viewer in the front view).
 */
export interface OnItemPose {
  front: PoseAt;
  side?: PoseAt;
  back?: PoseAt;
  facing?: ItemSide;
}

/**
 * One spot ON each item (a box to sit in, a bed, the top of a cat tree): the
 * bottom-left blocked tile, drawn shifted so the pose lands where it belongs
 * on the sprite, however the item is turned or mirrored.
 */
export function onItemSpots(items: PlacedFurniture[], pose: OnItemPose): ActivitySpot[] {
  return items.map((item) => {
    const frame = itemFrame(item.type);
    const at = pose[artView(frame)] ?? pose.front;
    const tiles = footprint(item);
    const last = tiles[tiles.length - 1];
    const col = item.col;
    const row = last.row;
    // The pose centre, in sprite px from the item's left edge, flips with the art.
    const half = TILE_SIZE / 2;
    return {
      key: `${col},${row}`,
      col,
      row,
      facing: sideDirection(frame, pose.facing ?? 'front'),
      onFurniture: true,
      itemUid: item.uid,
      offsetX: spriteX(frame, half + at.offsetX) - half,
      offsetY: at.offsetY,
      ...(frame.mirrored ? { mirrored: true } : {}),
    };
  });
}

/**
 * Ends of a tube (play tunnel) along its long axis: a spot at one free end,
 * facing in, with the opposite free end as its exit. Both ends must be floor.
 * A turned tunnel (taller than wide) runs up and down.
 */
export function throughSpots(ctx: SpotContext, items: PlacedFurniture[]): ActivitySpot[] {
  const out: ActivitySpot[] = [];
  for (const item of items) {
    const tiles = footprint(item);
    const cols = tiles.map((t) => t.col);
    const rows = tiles.map((t) => t.row);
    const vertical = new Set(rows).size > new Set(cols).size;
    const a = vertical
      ? { col: cols[0], row: Math.min(...rows) - 1 }
      : { col: Math.min(...cols) - 1, row: rows[0] };
    const b = vertical
      ? { col: cols[0], row: Math.max(...rows) + 1 }
      : { col: Math.max(...cols) + 1, row: rows[0] };
    const walk = (t: { col: number; row: number }) =>
      isWalkable(t.col, t.row, ctx.tileMap, ctx.blockedTiles);
    if (!walk(a) || !walk(b)) continue;
    const spot = (
      from: { col: number; row: number },
      exit: { col: number; row: number },
      facing: Direction,
    ): ActivitySpot => ({
      key: `${from.col},${from.row}`,
      col: from.col,
      row: from.row,
      facing,
      onFurniture: false,
      itemUid: item.uid,
      offsetX: 0,
      offsetY: 0,
      exit,
    });
    out.push(
      spot(a, b, vertical ? Direction.DOWN : Direction.RIGHT),
      spot(b, a, vertical ? Direction.UP : Direction.LEFT),
    );
  }
  return out;
}
