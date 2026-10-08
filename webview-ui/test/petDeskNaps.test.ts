/**
 * Pet naps on desks and tables (docs/catavasia/pet-interactions.md): the spot
 * skips a top a surface item covers, each table kind picks its own animation,
 * agent cats never pick the nap, and the Zzz waits until the cat is up.
 * The every-view side lives in the guard test (furnitureRotation.test.ts).
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, test } from 'vitest';

import { buildFurnitureCatalog } from '../../core/src/assets/build.ts';
import { decodeAllFurniture } from '../../core/src/assets/loader.ts';
import type { SpotContext } from '../src/office/engine/activitySpots.js';
import {
  DESK_NAP_ID,
  deskNapSpots,
  petDeskAnimFor,
} from '../src/office/engine/deskNapActivities.js';
import { buildActivitySpots, chooseIdleActivity } from '../src/office/engine/idleActivities.js';
import { petAnimFor } from '../src/office/engine/petActivities.js';
import {
  PET_PLAY_ANIMS,
  petNapAwake,
  petPlayStep,
  petWakeAt,
} from '../src/office/engine/petPlayAnims.js';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.js';
import {
  getBlockedTiles,
  layoutToSeats,
  layoutToTileMap,
} from '../src/office/layout/layoutSerializer.js';
import type { ActivitySpot, OfficeLayout, PlacedFurniture } from '../src/office/types.js';
import { TILE_SIZE, TileType } from '../src/office/types.js';

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');

beforeAll(() => {
  const catalog = buildFurnitureCatalog(ASSETS);
  const sprites = decodeAllFurniture(ASSETS, catalog);
  assert.ok(buildDynamicCatalog({ catalog, sprites } as never));
});

function ctx(furniture: PlacedFurniture[]): SpotContext {
  const tiles = Array.from({ length: 12 * 12 }, () => TileType.FLOOR_1);
  const layout = { version: 1, cols: 12, rows: 12, tiles, furniture } as OfficeLayout;
  return {
    furniture,
    seats: layoutToSeats(furniture),
    tileMap: layoutToTileMap(layout),
    blockedTiles: getBlockedTiles(furniture),
  };
}

const DESK: PlacedFurniture = { uid: 'desk', type: 'DESK_FRONT', col: 3, row: 4 };

test('a desk nap skips the place a surface item covers, and none is left when all are covered', () => {
  const [free] = deskNapSpots(ctx([DESK]));
  assert.ok(free, 'a bare desk has a nap spot');
  // A PC on the tile under the first choice moves the cat to another place on the top.
  const poseX = (sp: ActivitySpot) => sp.col * TILE_SIZE + TILE_SIZE / 2 + sp.offsetX;
  const under = Math.floor(poseX(free) / TILE_SIZE);
  const pc = { uid: 'pc', type: 'PC_FRONT_OFF', col: under, row: DESK.row + 1 };
  const [moved] = deskNapSpots(ctx([DESK, pc]));
  assert.ok(moved, 'another place is free');
  assert.notEqual(poseX(moved), poseX(free), 'the cat moves off the PC');
  // Something on every tile of the top: no nap there.
  const full = [0, 1, 2].flatMap((c) =>
    [0, 1].map((r) => ({
      uid: `m${c}${r}`,
      type: 'COFFEE',
      col: DESK.col + c,
      row: DESK.row + r,
    })),
  );
  assert.deepEqual(deskNapSpots(ctx([DESK, ...full])), []);
});

test('the cat steps onto the top from free floor: a walled-in bottom tile moves the spot', () => {
  const [open] = deskNapSpots(ctx([DESK]));
  // Boxes in front of and behind the tile under the pose (the desk's back row is
  // walkable floor): the cat gets on from the next tile.
  const boxes = [open.row + 1, DESK.row].map((row) => ({
    uid: `box${row}`,
    type: 'CARDBOARD_BOX',
    col: open.col,
    row,
  }));
  const spots = deskNapSpots(ctx([DESK, ...boxes]));
  assert.equal(spots.length, 1);
  assert.notEqual(spots[0].col, open.col, 'another tile');
  assert.equal(spots[0].row, open.row, 'still the bottom row');
  assert.equal(
    spots[0].col * TILE_SIZE + spots[0].offsetX,
    open.col * TILE_SIZE + open.offsetX,
    'the pose stays where it was',
  );
});

test('each table kind naps its own way; an unknown item falls back to the desk loaf', () => {
  assert.equal(petDeskAnimFor('DESK_SIDE'), 'deskLoaf');
  assert.equal(petDeskAnimFor('EXECUTIVE_DESK_SIDE:left'), 'deskLoaf');
  assert.equal(petDeskAnimFor('LEAD_DESK_BACK'), 'deskLoaf');
  assert.equal(petDeskAnimFor('TABLE_FRONT_SIDE'), 'tableSprawl');
  assert.equal(petDeskAnimFor('SMALL_TABLE_FRONT'), 'tableDonut');
  assert.equal(petDeskAnimFor('COFFEE_TABLE'), 'coffeeSprawl');
  assert.equal(petDeskAnimFor(undefined), 'deskLoaf');
  assert.equal(petAnimFor(DESK_NAP_ID, 'SMALL_TABLE_SIDE'), 'tableDonut');
});

test('agent cats never pick a desk nap', () => {
  const sets = buildActivitySpots(ctx([DESK]));
  assert.ok(sets.get(DESK_NAP_ID)?.spots.length, 'the spot set exists for pets');
  for (let i = 0; i < 200; i++) {
    const pick = chooseIdleActivity(null, sets, new Set(), () => i / 200);
    assert.notEqual(pick?.def.id, DESK_NAP_ID);
  }
});

test('a table nap hops up from the floor, sleeps with Zzz, wakes into the hop down', () => {
  for (const kind of ['deskLoaf', 'tableSprawl', 'tableDonut', 'coffeeSprawl'] as const) {
    const a = PET_PLAY_ANIMS[kind];
    assert.ok(a.nap, `${kind}: a nap`);
    assert.equal(a.intro![0].drop, 1, `${kind}: starts on the floor`);
    assert.equal(a.outro![a.outro!.length - 1].drop, 1, `${kind}: ends on the floor`);
    const dur = 30;
    assert.ok(petNapAwake(kind, 0.1, dur), `${kind}: no Zzz while hopping up`);
    assert.ok(!petNapAwake(kind, dur / 2, dur), `${kind}: Zzz while asleep`);
    assert.ok(petNapAwake(kind, dur - 0.1, dur), `${kind}: no Zzz while hopping down`);
    // Waking early jumps to the hop down, not past it.
    const wake = petWakeAt(kind, dur);
    assert.equal(petPlayStep(kind, wake, dur).step, a.outro![0], `${kind}: wakes into the outro`);
  }
  assert.equal(petWakeAt('sleep', 30), 30, 'a care nap just ends');
});

test('a top narrower than a sideways cat is marked narrow; a wide top is not', () => {
  const at = (type: string) => deskNapSpots(ctx([{ uid: 'd', type, col: 3, row: 2 }]))[0];
  assert.equal(at('DESK_SIDE').narrow, true, 'a 16 px desk side');
  assert.equal(at('SMALL_TABLE_SIDE').narrow, true, 'a 16 px table side');
  assert.equal(at('DESK_FRONT').narrow, undefined, 'a wide desk');
  assert.equal(at('TABLE_FRONT_SIDE').narrow, undefined, 'a wide table side');
});
