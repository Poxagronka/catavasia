/**
 * The legendary paintings (scripts/generate-painting-sprites.mjs) hang in the
 * editor's wall tab and never flip: a mirrored masterpiece reads wrong, so R
 * is a no-op. The guard (furnitureRotation.test.ts) checks that a symmetric
 * item has one view; this file pins that each painting stays symmetric.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, test } from 'vitest';

import { buildFurnitureCatalog } from '../../core/src/assets/build.ts';
import { decodeAllFurniture } from '../../core/src/assets/loader.ts';
import {
  buildDynamicCatalog,
  getCatalogByCategory,
  getRotatedType,
  getRotationScheme,
} from '../src/office/layout/furnitureCatalog.js';

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');
const PAINTINGS = ['PAINTING_ROTHKO', 'PAINTING_MOEBIUS', 'PAINTING_RUBENS', 'PAINTING_AIVAZOVSKY'];

beforeAll(() => {
  const catalog = buildFurnitureCatalog(ASSETS);
  const sprites = decodeAllFurniture(ASSETS, catalog);
  assert.ok(buildDynamicCatalog({ catalog, sprites } as never));
});

test('each legendary painting hangs on the wall and never flips with R', () => {
  const wall = getCatalogByCategory('wall');
  for (const id of PAINTINGS) {
    const entry = wall.find((e) => e.type === id);
    assert.ok(entry, `${id} is in the wall tab`);
    assert.equal(entry.canPlaceOnWalls, true, `${id} goes on a wall`);
    assert.equal(getRotationScheme(id), 'symmetric', `${id} must not mirror`);
    assert.notEqual(getRotatedType(id, 'cw'), `${id}:left`, `${id} has no mirrored view`);
  }
});
