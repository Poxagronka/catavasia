/**
 * Items turned with R (mirror scheme): the cat finds the same place on the
 * item as in its front view — the teaser's wand side, the shelf's book, the
 * litter box's dig direction, the house door the tail peeks from — and a
 * turned (taller than wide) tunnel runs up and down. Real assets.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, test } from 'vitest';

import { buildFurnitureCatalog } from '../../core/src/assets/build.ts';
import { decodeAllFurniture } from '../../core/src/assets/loader.ts';
import { peekLeft, peekSprite } from '../src/office/engine/housePeek.js';
import { getIdleActivity } from '../src/office/engine/idleActivities.js';
import { advanceRunThrough, isHiddenInRunThrough } from '../src/office/engine/runThrough.js';
import { buildDynamicCatalog, furnitureKind } from '../src/office/layout/furnitureCatalog.js';
import {
  getBlockedTiles,
  layoutToFurnitureInstances,
  layoutToSeats,
} from '../src/office/layout/layoutSerializer.js';
import { isLitterBoxType } from '../src/office/petCare/litterStages.js';
import { isHoodedLitterBox, litterBoxSprite } from '../src/office/sprites/petCareSprites.js';
import type {
  ActivitySpot,
  Character,
  IdleActivityRun,
  PlacedFurniture,
  TileType as TileTypeVal,
} from '../src/office/types.js';
import { CharacterState, Direction, TILE_SIZE, TileType } from '../src/office/types.js';

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');

beforeAll(() => {
  const catalog = buildFurnitureCatalog(ASSETS);
  const sprites = decodeAllFurniture(ASSETS, catalog);
  assert.ok(buildDynamicCatalog({ catalog, sprites } as never));
});

/** The spots of one activity with these items on a floor with a wall on rows 0-2. */
function spotsOf(id: string, furniture: PlacedFurniture[]): ActivitySpot[] {
  const tileMap: TileTypeVal[][] = Array.from({ length: 14 }, (_, r) =>
    Array.from({ length: 14 }, () => (r < 3 ? TileType.WALL : TileType.FLOOR_1)),
  );
  const ctx = {
    furniture,
    seats: layoutToSeats(furniture),
    tileMap,
    blockedTiles: getBlockedTiles(furniture),
  };
  return getIdleActivity(id)!.spots!(ctx);
}

const at = (type: string, col = 5, row = 6): PlacedFurniture => ({ uid: 'u', type, col, row });

test('a mirrored feather teaser is played with from its other side', () => {
  const [front] = spotsOf('teaser', [at('FEATHER_TEASER')]);
  const [mirror] = spotsOf('teaser', [at('FEATHER_TEASER:left')]);
  assert.deepEqual([front.col, front.facing], [4, Direction.RIGHT]);
  assert.deepEqual([mirror.col, mirror.facing], [6, Direction.LEFT]);
});

test('a mirrored bookshelf gives its book from the other column; the gap is drawn mirrored', () => {
  const [front] = spotsOf('skillRead', [at('BOOKSHELF', 5, 2)]);
  const [mirror] = spotsOf('skillRead', [at('BOOKSHELF:left', 5, 2)]);
  assert.equal(front.col, 6);
  assert.equal(mirror.col, 5);
  const [inst] = layoutToFurnitureInstances([at('BOOKSHELF:left', 5, 2)]);
  assert.equal(inst.mirrored, true);
});

test('a mirrored litter box: still a litter box, the cat digs facing the other way', () => {
  for (const type of ['LITTER_BOX_CORNER', 'LITTER_BOX_SMART']) {
    assert.ok(isLitterBoxType(`${type}:left`));
    assert.ok(litterBoxSprite(`${type}:left`, 2, 1), `${type}:left has fill stages`);
    const [front] = spotsOf('litter', [at(type)]);
    const [mirror] = spotsOf('litter', [at(`${type}:left`)]);
    assert.equal(front.facing, Direction.RIGHT);
    assert.equal(mirror.facing, Direction.LEFT);
    assert.equal(mirror.mirrored, true);
  }
  assert.ok(isHoodedLitterBox('LITTER_BOX_HOODED:left'));
  const [hood] = spotsOf('litterHood', [at('LITTER_BOX_HOODED:left')]);
  assert.equal(hood.peek?.mirrored, true);
  assert.equal(furnitureKind('LITTER_BOX_HOODED:left'), 'LITTER_BOX_HOODED');
});

test('a mirrored cat house shows the ears / tail mirrored, at the mirrored door', () => {
  for (const type of ['HOUSE_WOODEN', 'HOUSE_IGLOO', 'HOUSE_CARDBOARD', 'HOUSE_CONDO']) {
    const [front] = spotsOf('house', [at(type)]);
    const [mirror] = spotsOf('house', [at(`${type}:left`)]);
    // The drawn pixels mirror within the house sprite (odd-width ears too).
    const w = peekSprite(front.peek!.kind, '')[0].length;
    const lo = 5 * TILE_SIZE;
    const frontLeft = peekLeft(front.peek!, w) - lo;
    const mirrorLeft = peekLeft(mirror.peek!, w) - lo;
    assert.equal(mirrorLeft, TILE_SIZE - (frontLeft + w), type);
    assert.equal(mirror.peek!.mirrored, true, type);
    assert.equal(front.peek!.mirrored, undefined, type);
  }
});

test('a tunnel taller than wide runs up and down, hidden in the middle', () => {
  const spot: ActivitySpot = {
    key: '4,3',
    col: 4,
    row: 3,
    facing: Direction.DOWN,
    onFurniture: false,
    offsetX: 0,
    offsetY: 0,
    exit: { col: 4, row: 6 },
  };
  const run: IdleActivityRun = { id: 'tunnel', spot, phase: 'doing' } as IdleActivityRun;
  const ch = {
    x: 4 * TILE_SIZE + 8,
    y: 3 * TILE_SIZE + 8,
    dir: Direction.DOWN,
    frame: 0,
    frameTimer: 0,
    state: CharacterState.ACTIVITY,
    activity: run,
  } as unknown as Character;
  advanceRunThrough(ch, run, 0.5);
  assert.equal(ch.x, 4 * TILE_SIZE + 8, 'stays in its column');
  assert.ok(ch.y > 3 * TILE_SIZE + 8, 'moves down');
  assert.equal(ch.dir, Direction.DOWN);
  assert.ok(isHiddenInRunThrough(ch), 'inside the tube');
});
