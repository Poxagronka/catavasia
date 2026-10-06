/**
 * The bundled default office: the playroom doorway is as wide as the other
 * doorway, and the calm playroom (two toys, one house, the rest decor) is in
 * reach of a cat that walks in from the lounge.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, test } from 'vitest';

import { buildFurnitureCatalog } from '../../core/src/assets/build.ts';
import { OfficeState } from '../src/office/engine/officeState.js';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.js';
import { findPath, isWalkable } from '../src/office/layout/tileMap.js';
import type { OfficeLayout } from '../src/office/types.js';
import { TileType } from '../src/office/types.js';

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');

/** Newest default-layout-{N}.json, as the server picks it. */
function newestDefault(): OfficeLayout {
  const newest = fs
    .readdirSync(ASSETS)
    .map((f) => /^default-layout-(\d+)\.json$/.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  return JSON.parse(fs.readFileSync(path.join(ASSETS, newest[0]), 'utf-8')) as OfficeLayout;
}

/** The playroom: floor columns right of the lounge wall. */
const PLAYROOM_FIRST_COL = 20;
/** A free lounge tile: where a cat starts its walk to the playroom. */
const LOUNGE = { col: 12, row: 15 };

let layout: OfficeLayout;

beforeAll(() => {
  const catalog = buildFurnitureCatalog(ASSETS);
  const sprites = Object.fromEntries(catalog.map((c) => [c.id, [['']]]));
  assert.ok(buildDynamicCatalog({ catalog, sprites } as never));
  layout = newestDefault();
});

/** Rows where the wall column `col` is open floor between the rooms on its sides. */
function doorwayRows(col: number): number[] {
  const tile = (c: number, r: number) => layout.tiles[r * layout.cols + c];
  const floor = (c: number, r: number) =>
    tile(c, r) !== TileType.WALL && tile(c, r) !== TileType.VOID;
  const rows: number[] = [];
  for (let r = 0; r < layout.rows; r++) {
    if (floor(col, r) && floor(col - 1, r) && floor(col + 1, r)) rows.push(r);
  }
  return rows;
}

test('the lounge-playroom doorway is as wide as the main room-lounge doorway', () => {
  assert.deepEqual(doorwayRows(10), [14, 15, 16, 17]);
  assert.deepEqual(doorwayRows(19), doorwayRows(10));
});

test('every playroom toy and house spot is reachable from the lounge', () => {
  const os = new OfficeState(layout);
  assert.ok(isWalkable(LOUNGE.col, LOUNGE.row, os.tileMap, os.blockedTiles));
  const used = new Map<string, string>();
  for (const [activity, set] of os.activitySpots) {
    // The bookshelf there serves skill reading (a work activity, not a toy).
    if (activity === 'skillRead') continue;
    for (const spot of set.spots) {
      if (spot.col < PLAYROOM_FIRST_COL) continue;
      const where = `${activity} at ${spot.key}`;
      const blocked = new Set(os.blockedTiles);
      if (spot.onFurniture) blocked.delete(spot.key);
      const path = findPath(LOUNGE.col, LOUNGE.row, spot.col, spot.row, os.tileMap, blocked);
      assert.ok(path.length > 0, `${where} is unreachable`);
      if (spot.exit) {
        const out = findPath(spot.col, spot.row, spot.exit.col, spot.exit.row, os.tileMap, blocked);
        assert.ok(out.length > 0, `${where} has no way out`);
      }
      // One activity per tile: a cat at one toy never stands on another toy's spot.
      assert.equal(used.get(spot.key), undefined, `${where} also serves ${used.get(spot.key)}`);
      used.set(spot.key, activity);
    }
  }
  // Calm room: the scratching post, the ball of yarn, one house, and (revision 7) a litter box.
  assert.deepEqual([...new Set(used.values())].sort(), ['house', 'litter', 'scratch', 'yarn']);
});
