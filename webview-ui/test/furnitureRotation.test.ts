/**
 * GUARD — the furniture rule (docs/catavasia/furniture.md): every catalog
 * item turns with R, and every cat activity at it still works in every view.
 * For each item × each view it places the item alone in a fixture room and
 * builds every activity's spots there: the activities found in the front view
 * must all exist in every other view, each spot on walkable floor (or on the
 * item / a seat), in the item's ring, facing the item; the sprite, mirror flag,
 * animation frames and on-state of every view must resolve. A new furniture
 * folder is covered without touching this file.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, test } from 'vitest';

import { buildFurnitureCatalog } from '../../core/src/assets/build.ts';
import { decodeAllFurniture } from '../../core/src/assets/loader.ts';
import { canPlaceFurniture, rotateFurniture } from '../src/office/editor/editorActions.js';
import type { SpotContext } from '../src/office/engine/activitySpots.js';
import { stepDirection } from '../src/office/engine/characters.js';
import { itemFrameSprite } from '../src/office/engine/furnitureFrames.js';
import { IDLE_ACTIVITIES } from '../src/office/engine/idleActivities.js';
import {
  buildDynamicCatalog,
  FURNITURE_CATEGORIES,
  furnitureKind,
  getAnimationFrames,
  getCatalogByCategory,
  getCatalogEntry,
  getRotatedType,
  getRotationScheme,
  getToggledType,
  isRotatable,
} from '../src/office/layout/furnitureCatalog.js';
import { itemFrame, mirrorDirection } from '../src/office/layout/itemFrame.js';
import {
  getBlockedTiles,
  layoutToFurnitureInstances,
  layoutToSeats,
  layoutToTileMap,
} from '../src/office/layout/layoutSerializer.js';
import { isWalkable } from '../src/office/layout/tileMap.js';
import type {
  ActivitySpot,
  Character,
  OfficeLayout,
  PlacedFurniture,
  TileType as TileTypeVal,
} from '../src/office/types.js';
import { Direction, TILE_SIZE, TileType } from '../src/office/types.js';

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');

beforeAll(() => {
  const catalog = buildFurnitureCatalog(ASSETS);
  const sprites = decodeAllFurniture(ASSETS, catalog);
  assert.ok(buildDynamicCatalog({ catalog, sprites } as never));
});

/** Every item the editor offers (front views). */
function paletteTypes(): string[] {
  return FURNITURE_CATEGORIES.flatMap((c) => getCatalogByCategory(c.id).map((e) => e.type));
}

/** The item's views in R order, starting at `type`. */
function views(type: string): string[] {
  const out = [type];
  for (let t = getRotatedType(type, 'cw'); t && t !== type; t = getRotatedType(t, 'cw')) {
    assert.ok(out.length < 8, `${type}: R never comes back to the first view`);
    out.push(t);
  }
  return out;
}

const COLS = 16;
const ROWS = 16;
/** Rows 0-2 are wall (wall items hang on row 2), the rest floor. */
const WALL_ROWS = 3;

/** A room with the item alone in it: wall items on the wall, the rest mid-floor. */
function room(type: string): { layout: OfficeLayout; item: PlacedFurniture } {
  const entry = getCatalogEntry(type)!;
  const tiles: TileTypeVal[] = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) tiles.push(r < WALL_ROWS ? TileType.WALL : TileType.FLOOR_1);
  const row = entry.canPlaceOnWalls ? WALL_ROWS - entry.footprintH : 7;
  const item: PlacedFurniture = { uid: 'it', type, col: 6, row };
  const layout = { version: 1, cols: COLS, rows: ROWS, tiles, furniture: [item] } as OfficeLayout;
  assert.ok(canPlaceFurniture({ ...layout, furniture: [] }, type, item.col, item.row), type);
  return { layout, item };
}

function spotContext(layout: OfficeLayout): SpotContext {
  return {
    furniture: layout.furniture,
    seats: layoutToSeats(layout.furniture),
    tileMap: layoutToTileMap(layout),
    blockedTiles: getBlockedTiles(layout.furniture),
  };
}

/** Activity id → its spots (fallbacks included) with this item alone in the room. */
function activitySpots(ctx: SpotContext): Map<string, ActivitySpot[]> {
  const out = new Map<string, ActivitySpot[]>();
  for (const def of IDLE_ACTIVITIES) {
    const spots = [...(def.spots?.(ctx) ?? []), ...(def.fallbackSpots?.(ctx) ?? [])];
    if (spots.length > 0) out.set(def.id, spots);
  }
  return out;
}

/** Tiles from the spot to the item's footprint rectangle, per axis (0 = inside its span). */
function towardItem(spot: ActivitySpot, item: PlacedFurniture): { dx: number; dy: number } {
  const e = getCatalogEntry(item.type)!;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  return {
    dx: clamp(spot.col, item.col, item.col + e.footprintW - 1) - spot.col,
    dy: clamp(spot.row, item.row, item.row + e.footprintH - 1) - spot.row,
  };
}

function checkSpot(
  where: string,
  spot: ActivitySpot,
  item: PlacedFurniture,
  ctx: SpotContext,
): void {
  const e = getCatalogEntry(item.type)!;
  const { dx, dy } = towardItem(spot, item);
  const inside = dx === 0 && dy === 0;
  if (spot.onFurniture) {
    assert.ok(inside || spot.seatUid, `${where}: on-item spot off the item`);
  } else if (!inside) {
    assert.ok(isWalkable(spot.col, spot.row, ctx.tileMap, ctx.blockedTiles), `${where}: blocked`);
  }
  // The ring: next to the footprint (a shelf on the wall: up to 2 rows below it).
  const reach = e.canPlaceOnWalls ? 2 : 1;
  assert.ok(Math.abs(dx) <= reach && Math.abs(dy) <= reach, `${where}: ${dx},${dy} from the item`);
  // A pose drawn on the item stays over its sprite.
  if (spot.onFurniture && inside) {
    const centre = (spot.col - item.col) * TILE_SIZE + TILE_SIZE / 2 + spot.offsetX;
    assert.ok(centre >= 0 && centre <= e.footprintW * TILE_SIZE, `${where}: pose off the sprite`);
  }
}

/** A spot right next to the item (not diagonal) faces it. */
function checkFacing(where: string, spot: ActivitySpot, item: PlacedFurniture): void {
  const { dx, dy } = towardItem(spot, item);
  if (spot.seatUid || (dx !== 0 && dy !== 0) || (dx === 0 && dy === 0)) return;
  const want =
    dx > 0 ? Direction.RIGHT : dx < 0 ? Direction.LEFT : dy > 0 ? Direction.DOWN : Direction.UP;
  assert.equal(spot.facing, want, `${where}: faces ${spot.facing}, the item is ${want}`);
}

/** Activities whose spots stand on the floor around the item and may face anywhere. */
const FREE_FACING = new Set(['sleep', 'coffeeSip']);

test('every catalog item turns with R; a symmetric one is the only no-op', () => {
  const types = paletteTypes();
  assert.ok(types.length >= 50, `only ${types.length} catalog items`);
  for (const type of types) {
    assert.ok(isRotatable(type), `${type} is not rotatable`);
    const scheme = getRotationScheme(type);
    const v = views(type);
    if (scheme === 'symmetric') {
      assert.equal(v.length, 1, `${type} is symmetric but has views`);
      continue;
    }
    assert.ok(v.length >= 2, `${type} (${scheme}) has no second view`);
    const kinds = new Set(v.map(furnitureKind));
    assert.equal(kinds.size, 1, `${type}: views of different items ${[...kinds]}`);
  }
});

test('every view of every item renders: sprite, mirror flag, frames, on-state', () => {
  for (const type of paletteTypes()) {
    for (const view of views(type)) {
      const { layout, item } = room(view);
      const [inst] = layoutToFurnitureInstances(layout.furniture);
      assert.ok(inst?.sprite.length, `${view}: no sprite`);
      assert.equal(!!inst.mirrored, itemFrame(view).mirrored, `${view}: mirror flag`);
      const frames = getAnimationFrames(view.split(':')[0]) ?? [];
      for (let k = 0; k < frames.length; k++)
        assert.ok(itemFrameSprite(item.type, k)?.length, `${view}: frame ${k}`);
      const on = getToggledType(view);
      if (on) assert.ok(getCatalogEntry(on)?.sprite.length, `${view}: on-state ${on}`);
    }
  }
});

test('every activity of an item works in every view: spots exist, are reachable, face it', () => {
  for (const type of paletteTypes()) {
    const front = activitySpots(spotContext(room(type).layout));
    for (const view of views(type)) {
      const { layout, item } = room(view);
      const ctx = spotContext(layout);
      const got = activitySpots(ctx);
      for (const id of front.keys())
        assert.ok(got.get(id)?.length, `${view}: activity "${id}" has no spot (front has)`);
      for (const [id, spots] of got) {
        const def = IDLE_ACTIVITIES.find((d) => d.id === id)!;
        const own = new Set(def.spots?.(ctx).map((s) => s.key));
        for (const spot of spots) {
          const where = `${view} ${id} @${spot.key}`;
          checkSpot(where, spot, item, ctx);
          if (own.has(spot.key) && !FREE_FACING.has(id)) checkFacing(where, spot, item);
          if (spot.exit) checkSpot(`${where} exit`, { ...spot, ...spot.exit }, item, ctx);
        }
      }
    }
  }
});

test('a mirror-scheme item mirrors every pose on it: px, facing, step directions', () => {
  for (const type of paletteTypes().filter((t) => getRotationScheme(t) === 'mirror')) {
    const left = getRotatedType(type, 'cw')!;
    const front = activitySpots(spotContext(room(type).layout));
    const mirror = activitySpots(spotContext(room(left).layout));
    const w = getCatalogEntry(type)!.footprintW;
    for (const [id, spots] of front) {
      const on = spots.filter((s) => s.onFurniture && !s.seatUid);
      const flipped = mirror.get(id)!.filter((s) => s.onFurniture && !s.seatUid);
      assert.equal(flipped.length, on.length, `${left} ${id}`);
      on.forEach((s, i) => {
        const m = flipped[i];
        assert.equal(m.offsetX, (w - 1) * TILE_SIZE - s.offsetX, `${left} ${id}: offsetX`);
        assert.equal(m.facing, mirrorDirection(s.facing), `${left} ${id}: facing`);
        assert.equal(m.mirrored, true, `${left} ${id}: steps not mirrored`);
      });
    }
  }
});

test('R keeps an item when its turned footprint does not fit, and turns it when it does', () => {
  // DESK turns from 3x2 (front) to a taller side view: against the bottom wall it cannot.
  const desk = room('DESK_FRONT').layout;
  const side = getRotatedType('DESK_FRONT', 'cw')!;
  const sideH = getCatalogEntry(side)!.footprintH;
  const frontH = getCatalogEntry('DESK_FRONT')!.footprintH;
  assert.ok(sideH > frontH, 'the desk side view is taller');
  const tight = {
    ...desk,
    furniture: [{ ...desk.furniture[0], row: ROWS - frontH }],
  };
  assert.equal(rotateFurniture(tight, 'it', 'cw'), tight, 'turned into the wall');
  const turned = rotateFurniture(desk, 'it', 'cw');
  assert.equal(turned.furniture[0].type, side);
});

test('a mirrored item swaps the LEFT/RIGHT of its activity steps', () => {
  const ch = {
    dir: Direction.LEFT,
    activity: { spot: { mirrored: true } },
  } as unknown as Character;
  assert.equal(stepDirection(ch, { f: 0, sec: 1, dir: Direction.RIGHT }), Direction.LEFT);
  assert.equal(stepDirection(ch, { f: 0, sec: 1, dir: Direction.UP }), Direction.UP);
  assert.equal(stepDirection(ch, { f: 0, sec: 1 }), Direction.LEFT);
});
