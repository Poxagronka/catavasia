/**
 * Floor accidents land on random free floor tiles spread over the rooms,
 * never on furniture, a box, a poop, a doorway or a taken tile; and the
 * pooping timers run at half the old rate.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  LITTER_ACTIVITY_WEIGHT,
  LITTER_DUE_SEC,
  PET_BOWEL_PER_HOUR,
  PET_BOWEL_PER_MEAL,
  POOP_SPACING_TILES,
} from '../src/constants.js';
import { mulberry32 } from '../src/office/engine/socialMoves.js';
import { isWalkable } from '../src/office/layout/tileMap.js';
import { PetCareWorld } from '../src/office/petCare/petCareWorld.js';
import { floorPoopSpot } from '../src/office/petCare/poopSpots.js';
import type { PlacedFurniture, TileType as TileTypeVal } from '../src/office/types.js';
import { TileType } from '../src/office/types.js';

const W = TileType.WALL;

/**
 * Three rooms: A (cols 1-6, floor 1) joins B (cols 8-12, floor 2) through a
 * one-tile door at (7,3); B opens wide into C (cols 13-18, floor 3). An
 * isolated room D (cols 20-22) is walled off: the cat cannot reach it.
 */
function office() {
  const tileMap: TileTypeVal[][] = [];
  for (let r = 0; r < 8; r++) {
    const row: TileTypeVal[] = [];
    for (let c = 0; c < 24; c++) {
      let t: TileTypeVal = W;
      if (r > 0 && r < 7) {
        if (c >= 1 && c <= 6) t = TileType.FLOOR_1;
        else if (c === 7 && r === 3) t = TileType.FLOOR_1;
        else if (c >= 8 && c <= 12) t = TileType.FLOOR_2;
        else if (c >= 13 && c <= 18) t = TileType.FLOOR_3;
        else if (c >= 20 && c <= 22) t = TileType.FLOOR_4;
      }
      row.push(t);
    }
    tileMap.push(row);
  }
  const furniture: PlacedFurniture[] = [
    { uid: 'box', type: 'LITTER_BOX', col: 2, row: 2 },
    { uid: 'desk', type: 'TEST_DESK', col: 10, row: 3 },
    { uid: 'rug', type: 'TEST_WALK_THROUGH', col: 15, row: 4 },
  ];
  const blockedTiles = new Set(['10,3']);
  return { furniture, tileMap, blockedTiles };
}

const roomOf = (col: number) => (col <= 7 ? 'A' : col <= 12 ? 'B' : col <= 18 ? 'C' : 'D');

test('an accident spot is always a free, reachable floor tile', () => {
  const env = office();
  const rand = mulberry32(7);
  const world = new PetCareWorld();
  world.floorPoop(5, 5);
  const furnitureKeys = new Set(env.furniture.map((f) => `${f.col},${f.row}`));
  for (let i = 0; i < 2000; i++) {
    const spot = floorPoopSpot(3, 4, env, world, rand, (k) => k !== '4,4');
    assert.ok(spot);
    const key = `${spot.col},${spot.row}`;
    assert.ok(isWalkable(spot.col, spot.row, env.tileMap, env.blockedTiles), key);
    assert.ok(!furnitureKeys.has(key), `on furniture ${key}`);
    assert.notEqual(key, '7,3', 'never in the doorway');
    assert.notEqual(key, '4,4', 'never a taken tile');
    assert.notEqual(roomOf(spot.col), 'D', 'never an unreachable room');
    const far = (c: number, r: number) =>
      Math.max(Math.abs(c - spot.col), Math.abs(r - spot.row)) >= POOP_SPACING_TILES;
    assert.ok(far(2, 2) && far(5, 5), `away from the box and the poop: ${key}`);
  }
});

test('accidents spread over every reachable room, not heaped by the box', () => {
  const env = office();
  const rand = mulberry32(42);
  const world = new PetCareWorld();
  const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (let i = 0; i < 12; i++) {
    const spot = floorPoopSpot(3, 4, env, world, rand);
    assert.ok(spot);
    assert.ok(!world.floorPoops.some((p) => p.col === spot.col && p.row === spot.row));
    world.floorPoop(spot.col, spot.row);
    counts[roomOf(spot.col)]++;
  }
  // Rooms with fewer poops win more often: each reachable room gets 3-5 of 12.
  for (const r of ['A', 'B', 'C'])
    assert.ok(counts[r] >= 3 && counts[r] <= 5, JSON.stringify(counts));
  assert.equal(counts.D, 0);
});

test('a crowded office still finds the last free tile; a full one finds none', () => {
  const F = TileType.FLOOR_1;
  const tileMap: TileTypeVal[][] = [
    [W, W, W, W, W],
    [W, F, F, F, W],
    [W, F, F, F, W],
    [W, F, F, F, W],
    [W, W, W, W, W],
  ];
  const env = { furniture: [], tileMap, blockedTiles: new Set<string>() };
  const world = new PetCareWorld();
  for (let r = 1; r <= 3; r++)
    for (let c = 1; c <= 3; c++) if (c !== 2 || r !== 2) world.floorPoop(c, r);
  assert.deepEqual(floorPoopSpot(1, 1, env, world, mulberry32(1)), { col: 2, row: 2 });
  world.floorPoop(2, 2);
  assert.equal(floorPoopSpot(1, 1, env, world, mulberry32(1)), null);
});

test('pooping runs at half the old rate', () => {
  assert.equal(PET_BOWEL_PER_MEAL, 20);
  assert.equal(PET_BOWEL_PER_HOUR, 3);
  assert.equal(LITTER_DUE_SEC, 60 * 60);
  assert.equal(LITTER_ACTIVITY_WEIGHT, 0.1);
});
