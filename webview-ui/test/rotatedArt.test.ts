/**
 * Drawn views (feat/rotate-art): the executive desk, the table, the tunnel
 * and the hammock have real side (and back) art, the PC switches on in every
 * view, and a mirror view saved before an item got drawn views still loads.
 * The guard (furnitureRotation.test.ts) covers spots and rendering for every
 * view; this file checks what the art decides. Real assets.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, test } from 'vitest';

import { buildFurnitureCatalog } from '../../core/src/assets/build.ts';
import { decodeAllFurniture } from '../../core/src/assets/loader.ts';
import { getIdleActivity } from '../src/office/engine/idleActivities.js';
import {
  buildDynamicCatalog,
  getCatalogEntry,
  getOnStateType,
  getRotatedType,
  getRotationScheme,
} from '../src/office/layout/furnitureCatalog.js';
import {
  getBlockedTiles,
  layoutToFurnitureInstances,
  layoutToSeats,
  migrateLayoutColors,
} from '../src/office/layout/layoutSerializer.js';
import type {
  OfficeLayout,
  PlacedFurniture,
  TileType as TileTypeVal,
} from '../src/office/types.js';
import { Direction, TileType } from '../src/office/types.js';

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');

beforeAll(() => {
  const catalog = buildFurnitureCatalog(ASSETS);
  const sprites = decodeAllFurniture(ASSETS, catalog);
  assert.ok(buildDynamicCatalog({ catalog, sprites } as never));
});

function views(type: string): string[] {
  const out = [type];
  for (let t = getRotatedType(type, 'cw'); t && t !== type; t = getRotatedType(t, 'cw'))
    out.push(t);
  return out;
}

const size = (type: string) => {
  const e = getCatalogEntry(type)!;
  return [e.footprintW, e.footprintH];
};

test('drawn views turn the footprint a quarter', () => {
  assert.deepEqual(views('EXECUTIVE_DESK'), [
    'EXECUTIVE_DESK',
    'EXECUTIVE_DESK_SIDE',
    'EXECUTIVE_DESK_BACK',
    'EXECUTIVE_DESK_SIDE:left',
  ]);
  assert.deepEqual(size('EXECUTIVE_DESK_SIDE'), [2, 3]);
  assert.deepEqual(size('EXECUTIVE_DESK_BACK'), [3, 2]);
  assert.deepEqual(views('TABLE_FRONT'), ['TABLE_FRONT', 'TABLE_FRONT_SIDE']);
  assert.deepEqual(size('TABLE_FRONT_SIDE'), [4, 3]);
  assert.deepEqual(views('PLAY_TUNNEL'), ['PLAY_TUNNEL', 'PLAY_TUNNEL_SIDE']);
  assert.deepEqual(size('PLAY_TUNNEL_SIDE'), [1, 2]);
  assert.deepEqual(views('BED_HAMMOCK'), [
    'BED_HAMMOCK',
    'BED_HAMMOCK_SIDE',
    'BED_HAMMOCK_SIDE:left',
  ]);
  // The benches are 1x1 stools: every side looks the same.
  assert.equal(getRotationScheme('WOODEN_BENCH'), 'symmetric');
  assert.equal(getRotationScheme('CUSHIONED_BENCH'), 'symmetric');
});

/** The spots of one activity with these items on open floor. */
function spotsOf(id: string, furniture: PlacedFurniture[]) {
  const tileMap: TileTypeVal[][] = Array.from({ length: 12 }, () =>
    Array.from({ length: 12 }, () => TileType.FLOOR_1),
  );
  const ctx = {
    furniture,
    seats: layoutToSeats(furniture),
    tileMap,
    blockedTiles: getBlockedTiles(furniture),
  };
  return getIdleActivity(id)!.spots!(ctx);
}

test('the turned tunnel runs up and down, from the open floor above and below', () => {
  const spots = spotsOf('tunnel', [{ uid: 't', type: 'PLAY_TUNNEL_SIDE', col: 5, row: 5 }]);
  assert.deepEqual(
    spots.map((s) => [s.col, s.row, s.facing, s.exit?.col, s.exit?.row]),
    [
      [5, 4, Direction.DOWN, 5, 7],
      [5, 7, Direction.UP, 5, 4],
    ],
  );
});

test('the cat naps in the hammock sling in the side views, mirrored on the left', () => {
  const [front] = spotsOf('bed', [{ uid: 'h', type: 'BED_HAMMOCK', col: 5, row: 5 }]);
  const [side] = spotsOf('bed', [{ uid: 'h', type: 'BED_HAMMOCK_SIDE', col: 5, row: 5 }]);
  const [left] = spotsOf('bed', [{ uid: 'h', type: 'BED_HAMMOCK_SIDE:left', col: 5, row: 5 }]);
  assert.deepEqual([front.offsetX, front.offsetY], [0, -3]);
  assert.deepEqual([side.offsetX, side.offsetY], [2, -5]);
  assert.deepEqual([left.offsetX, left.offsetY, left.mirrored], [-2, -5, true]);
});

test('the PC switches on in every view, its mirrored side too', () => {
  assert.equal(getOnStateType('PC_FRONT_OFF'), 'PC_FRONT_ON_1');
  assert.equal(getOnStateType('PC_SIDE'), 'PC_SIDE_ON_1');
  assert.equal(getOnStateType('PC_BACK'), 'PC_BACK_ON_1');
  assert.equal(getOnStateType('PC_SIDE:left'), 'PC_SIDE_ON_1:left');
  const [inst] = layoutToFurnitureInstances([
    { uid: 'p', type: 'PC_SIDE_ON_2:left', col: 0, row: 0 },
  ]);
  assert.equal(inst.mirrored, true);
  // An on view still turns with R.
  assert.ok(getRotatedType('PC_SIDE_ON_1', 'cw'));
});

test('a mirror view saved before its item got drawn views loads as the front', () => {
  const layout = {
    version: 1,
    cols: 4,
    rows: 4,
    tiles: Array(16).fill(TileType.FLOOR_1),
    furniture: [
      { uid: 'a', type: 'PLAY_TUNNEL:left', col: 0, row: 0 },
      { uid: 'b', type: 'EXECUTIVE_DESK:left', col: 0, row: 1 },
      { uid: 'c', type: 'SOFA_SIDE:left', col: 3, row: 0 },
    ],
  } as OfficeLayout;
  const types = migrateLayoutColors(layout).furniture.map((f) => f.type);
  assert.deepEqual(types, ['PLAY_TUNNEL', 'EXECUTIVE_DESK', 'SOFA_SIDE:left']);
});
