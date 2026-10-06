/**
 * Coffee machines on tables: they stand on the table top (not over its front
 * edge), they rotate in the editor (R), and a cat brews from the side the
 * machine faces. Real sprites from public/assets (scripts/generate-coffee-sprites.mjs).
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeAll, beforeEach, test } from 'vitest';

import { buildFurnitureCatalog } from '../../core/src/assets/build.ts';
import { decodeAllFurniture } from '../../core/src/assets/loader.ts';
import { CUP_OUT_FRAME } from '../src/office/engine/coffeeActivities.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import { mulberry32 } from '../src/office/engine/socialMoves.js';
import {
  buildDynamicCatalog,
  getAnimationFrames,
  getCatalogByCategory,
  getCatalogEntry,
  getRotatedType,
  isRotatable,
} from '../src/office/layout/furnitureCatalog.js';
import { layoutToFurnitureInstances } from '../src/office/layout/layoutSerializer.js';
import type { OfficeLayout, PlacedFurniture, SpriteData } from '../src/office/types.js';
import { CharacterState, Direction, TILE_SIZE, TileType } from '../src/office/types.js';

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');

const MACHINES = [
  'ESPRESSO_MACHINE',
  'DRIP_COFFEE_MAKER',
  'POUR_OVER',
  'FRENCH_PRESS',
  'MOKA_POT',
  'ELECTRIC_KETTLE',
];

beforeAll(() => {
  const catalog = buildFurnitureCatalog(ASSETS);
  const sprites = decodeAllFurniture(ASSETS, catalog);
  assert.ok(buildDynamicCatalog({ catalog, sprites } as never));
});

const realRandom = Math.random;
beforeEach(() => {
  Math.random = mulberry32(7);
});
afterEach(() => {
  Math.random = realRandom;
});

/** Last sprite row with a visible pixel. */
function bottomRow(sprite: SpriteData): number {
  for (let y = sprite.length - 1; y >= 0; y--) if (sprite[y].some((px) => px !== '')) return y;
  throw new Error('empty sprite');
}

/**
 * Table top of each table type in the default layout, as sprite rows (read
 * from the PNGs): below the last row is the front edge and the apron.
 */
const TABLE_TOP = {
  SMALL_TABLE_FRONT: { first: 11, last: 23 },
  SMALL_TABLE_SIDE: { first: 10, last: 39 },
} as const;

/** Every placeable view of a machine: front and every rotation from it. */
function views(type: string): string[] {
  const out = [type];
  for (let t = getRotatedType(type, 'cw'); t && t !== type; t = getRotatedType(t, 'cw'))
    out.push(t);
  return out;
}

function baseY(item: PlacedFurniture, layout: PlacedFurniture[]): number {
  const inst = layoutToFurnitureInstances(layout).find((f) => f.uid === item.uid)!;
  return inst.y + bottomRow(inst.sprite);
}

function defaultLayout(): OfficeLayout {
  const files = fs.readdirSync(ASSETS).filter((f) => /^default-layout-\d+\.json$/.test(f));
  const newest = files.sort((a, b) => parseInt(a.slice(15)) - parseInt(b.slice(15))).at(-1)!;
  return JSON.parse(fs.readFileSync(path.join(ASSETS, newest), 'utf-8')) as OfficeLayout;
}

test('the coffee items of the default layout stand on their table top', () => {
  const furniture = defaultLayout().furniture;
  const tables = furniture.filter((f) => f.type in TABLE_TOP);
  const coffee = furniture.filter((f) =>
    /^(COFFEE_MUGS|ESPRESSO|DRIP|POUR|FRENCH|MOKA|ELECTRIC)/.test(f.type),
  );
  assert.ok(coffee.length >= 4);
  for (const item of coffee) {
    const table = tables.find((t) => {
      const e = getCatalogEntry(t.type)!;
      return (
        item.col >= t.col &&
        item.col < t.col + e.footprintW &&
        item.row >= t.row &&
        item.row < t.row + e.footprintH
      );
    });
    assert.ok(table, `${item.type} stands on a table`);
    const top = TABLE_TOP[table.type as keyof typeof TABLE_TOP];
    const y = baseY(item, furniture);
    assert.ok(
      y <= table.row * TILE_SIZE + top.last,
      `${item.type} at row ${item.row}: base ${y} is over the edge`,
    );
    assert.ok(
      y >= table.row * TILE_SIZE + top.first,
      `${item.type}: base ${y} is behind the table`,
    );
  }
});

test('every machine view and the mugs stand on the front row of both table types', () => {
  const types = [...MACHINES.flatMap(views), 'COFFEE_MUGS'];
  for (const [tableType, top] of Object.entries(TABLE_TOP)) {
    const table: PlacedFurniture = { uid: 't', type: tableType, col: 0, row: 0 };
    const frontRow = getCatalogEntry(tableType)!.footprintH - 1;
    for (const type of types) {
      const item: PlacedFurniture = { uid: 'm', type, col: 0, row: frontRow };
      const y = baseY(item, [table, item]);
      assert.ok(y <= top.last && y >= top.first, `${type} on ${tableType}: base ${y}`);
      // Every brewing frame keeps the size, so the base never jumps.
      for (const f of getAnimationFrames(type.split(':')[0]) ?? [])
        assert.equal(getCatalogEntry(f)!.sprite.length, getCatalogEntry(type)!.sprite.length, f);
    }
  }
});

test('a surface item on the floor still draws inside its own tile', () => {
  const item: PlacedFurniture = { uid: 'm', type: 'DRIP_COFFEE_MAKER', col: 2, row: 3 };
  const y = baseY(item, [item]);
  assert.ok(y >= 3 * TILE_SIZE && y < 4 * TILE_SIZE, `base ${y}`);
});

test('the coffee machines rotate in the editor, and the catalog shows one item each', () => {
  for (const type of MACHINES) {
    assert.ok(isRotatable(type), `${type} rotates`);
    const v = views(type);
    const boxy = type === 'ESPRESSO_MACHINE' || type === 'DRIP_COFFEE_MAKER';
    assert.deepEqual(
      v,
      boxy ? [type, `${type}_SIDE`, `${type}_BACK`, `${type}_SIDE:left`] : [type, `${type}_SIDE`],
    );
    assert.equal(getRotatedType(type, 'ccw'), v.at(-1));
    for (const t of v) {
      const frames = getAnimationFrames(t.split(':')[0]);
      assert.equal(frames?.length, CUP_OUT_FRAME + 1, `${t} has its brewing frames`);
    }
  }
  const tab = getCatalogByCategory('coffee').map((e) => e.type);
  assert.deepEqual(tab.sort(), [...MACHINES, 'COFFEE_MUGS'].sort());
});

/** An open 7x7 room with one machine in the middle. */
function room(type: string, extra: PlacedFurniture[] = []): OfficeState {
  const cols = 7;
  const rows = 7;
  return new OfficeState({
    version: 1,
    cols,
    rows,
    tiles: new Array(cols * rows).fill(TileType.FLOOR_1),
    furniture: [{ uid: 'm', type, col: 3, row: 3 }, ...extra],
    layoutRevision: 1,
  } as OfficeLayout);
}

const brewSpots = (os: OfficeState) =>
  os.activitySpots.get('brew')!.spots.map((s) => ({ key: s.key, facing: s.facing }));

test('a cat brews from the side the machine faces', () => {
  const cases: Array<[string, string, Direction]> = [
    ['ESPRESSO_MACHINE', '3,4', Direction.UP],
    ['ESPRESSO_MACHINE_SIDE', '4,3', Direction.LEFT],
    ['ESPRESSO_MACHINE_SIDE:left', '2,3', Direction.RIGHT],
    ['ESPRESSO_MACHINE_BACK', '3,2', Direction.DOWN],
    ['MOKA_POT_SIDE', '4,3', Direction.LEFT],
  ];
  for (const [type, key, facing] of cases)
    assert.deepEqual(brewSpots(room(type)), [{ key, facing }], type);
});

test('a machine whose front is blocked is used from its sides, never from behind', () => {
  const os = room('ESPRESSO_MACHINE', [{ uid: 'b', type: 'BIN', col: 3, row: 4 }]);
  assert.deepEqual(
    brewSpots(os).sort((a, b) => a.key.localeCompare(b.key)),
    [
      { key: '2,3', facing: Direction.RIGHT },
      { key: '4,3', facing: Direction.LEFT },
    ],
  );
});

test('brewing at a rotated machine plays its own frames and shows the cup out', () => {
  const layout = defaultLayout();
  const espresso = layout.furniture.find((f) => f.uid === 'f-coffee-espresso')!;
  espresso.type = 'ESPRESSO_MACHINE_SIDE';
  const os = new OfficeState(layout);
  os.addAgent(1, 0, 0, undefined, true);
  os.setAgentActive(1, false);
  const ch = os.characters.get(1)!;
  ch.state = CharacterState.IDLE;
  const spot = os.activitySpots.get('brew')!.spots.find((s) => s.itemUid === espresso.uid)!;
  assert.deepEqual({ key: spot.key, facing: spot.facing }, { key: '2,19', facing: Direction.LEFT });
  assert.ok(os.forceIdleActivity(1, 'brew', spot.key));
  const sprite = () => os.getFurnitureForRender().find((f) => f.uid === espresso.uid)!.sprite;
  const frames = getAnimationFrames('ESPRESSO_MACHINE_SIDE')!.map(
    (t) => getCatalogEntry(t)!.sprite,
  );
  const seen = new Set<number>();
  for (let t = 0; t < 40 && ch.activity?.id !== 'coffeeSip'; t += 0.05) {
    os.update(0.05);
    seen.add(frames.indexOf(sprite()));
  }
  for (let f = 1; f <= 5; f++) assert.ok(seen.has(f), `frame ${f}`);
  assert.equal(ch.activity?.id, 'coffeeSip');
  assert.equal(sprite(), frames[CUP_OUT_FRAME], 'the cup is out');
});
