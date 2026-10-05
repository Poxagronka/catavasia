/**
 * Cat toys join the idle-activity pool: each toy gives the right spots
 * (beside it, on it, or through it) and plays with the cat.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { beforeAll, test } from 'vitest';

import { OfficeState } from '../src/office/engine/officeState.js';
import { isHiddenInRunThrough } from '../src/office/engine/runThrough.js';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.js';
import type { OfficeLayout } from '../src/office/types.js';
import { CharacterState, Direction, TileType } from '../src/office/types.js';

const PIXEL = [['']];

beforeAll(() => {
  const asset = (id: string, w: number, h: number, bg = 0) => ({
    id,
    name: id,
    label: id,
    category: 'toys',
    file: `${id}.png`,
    width: w * 16,
    height: h * 16,
    footprintW: w,
    footprintH: h,
    isDesk: false,
    canPlaceOnWalls: false,
    backgroundTiles: bg,
  });
  const catalog = [
    asset('SCRATCHING_POST', 1, 2, 1),
    asset('CARDBOARD_BOX', 1, 1),
    asset('PLAY_TUNNEL', 2, 1),
    asset('YARN_BALL', 1, 1),
    asset('FEATHER_TEASER', 1, 2, 1),
  ];
  const sprites = Object.fromEntries(catalog.map((c) => [c.id, PIXEL]));
  assert.ok(buildDynamicCatalog({ catalog, sprites } as never));
});

/** 12x8 floor with a post (base at 2,2), a box (6,2), a tunnel (4-5,6), yarn (9,2), a teaser (9,5-6). */
function playroom(): OfficeState {
  const cols = 12;
  const rows = 8;
  const layout: OfficeLayout = {
    version: 1,
    cols,
    rows,
    tiles: new Array<TileType>(cols * rows).fill(TileType.FLOOR_1),
    furniture: [
      { uid: 'post', type: 'SCRATCHING_POST', col: 2, row: 1 },
      { uid: 'box', type: 'CARDBOARD_BOX', col: 6, row: 2 },
      { uid: 'tunnel', type: 'PLAY_TUNNEL', col: 4, row: 6 },
      { uid: 'yarn', type: 'YARN_BALL', col: 9, row: 2 },
      { uid: 'teaser', type: 'FEATHER_TEASER', col: 9, row: 5 },
    ],
  };
  return new OfficeState(layout);
}

function idleCat(os: OfficeState, id: number) {
  os.addAgent(id, 0, 0, undefined, true);
  os.setAgentActive(id, false);
  const ch = os.characters.get(id)!;
  ch.state = CharacterState.IDLE;
  return ch;
}

/** Step until `done` holds (or fail after `max` seconds). */
function runUntil(os: OfficeState, done: () => boolean, max = 30, each?: () => void) {
  for (let t = 0; t < max; t += 0.05) {
    if (done()) return;
    os.update(0.05);
    each?.();
  }
  assert.fail('condition never held');
}

function runFor(os: OfficeState, seconds: number, each?: () => void) {
  for (let t = 0; t < seconds; t += 0.05) {
    os.update(0.05);
    each?.();
  }
}

test('side toys: a spot left and right of the blocking tile, facing the toy, nudged toward it', () => {
  const os = playroom();
  const post = os.activitySpots.get('scratch')!.spots;
  assert.deepEqual(
    post.map((s) => s.key).sort(),
    ['1,2', '3,2'],
    'beside the base, not the walk-through top',
  );
  const left = post.find((s) => s.key === '1,2')!;
  assert.equal(left.facing, Direction.RIGHT);
  assert.ok(left.offsetX > 0, 'paws reach the post');
  const teaser = os.activitySpots.get('teaser')!.spots;
  assert.deepEqual(
    teaser.map((s) => s.key),
    ['8,6'],
    'the feather hangs on the left only',
  );
});

test('box: the cat sits on the box tile itself', () => {
  const os = playroom();
  const [spot] = os.activitySpots.get('box')!.spots;
  assert.equal(spot.key, '6,2');
  assert.equal(spot.onFurniture, true);
  const ch = idleCat(os, 1);
  assert.ok(os.forceIdleActivity(1, 'box'));
  runUntil(os, () => ch.state === CharacterState.ACTIVITY);
  assert.deepEqual([ch.tileCol, ch.tileRow], [6, 2]);
});

test('tunnel: runs through, hidden inside, and ends back on a floor tile', () => {
  const os = playroom();
  const spots = os.activitySpots.get('tunnel')!.spots;
  assert.deepEqual(
    spots.map((s) => [s.key, s.exit]),
    [
      ['3,6', { col: 6, row: 6 }],
      ['6,6', { col: 3, row: 6 }],
    ],
  );
  const ch = idleCat(os, 1);
  assert.ok(os.forceIdleActivity(1, 'tunnel'));
  let hidden = false;
  runUntil(
    os,
    () => ch.lastActivityId === 'tunnel',
    40,
    () => {
      if (isHiddenInRunThrough(ch)) hidden = true;
    },
  );
  assert.ok(hidden, 'the cat went through the tunnel out of sight');
  assert.ok([3, 6].includes(ch.tileCol), `ends at a tunnel end, not inside: ${ch.tileCol}`);
  assert.equal(ch.x, ch.tileCol * 16 + 8);
});

test('a toy in use moves: the yarn rolls while a cat bats it', () => {
  const os = playroom();
  const ch = idleCat(os, 1);
  assert.ok(os.forceIdleActivity(1, 'yarn'));
  runUntil(os, () => ch.state === CharacterState.ACTIVITY);
  const still = os.furniture.find((f) => f.uid === 'yarn')!;
  const xs = new Set(
    [0.3, 0.9, 1.5, 2.1].map((t) => os.getFurnitureForRender(t).find((f) => f.uid === 'yarn')!.x),
  );
  assert.ok(xs.size > 1, 'the yarn shifts between frames');
  assert.ok(
    [...xs].every((x) => Math.abs(x - still.x) <= 2),
    'only a little',
  );
});

test('toys join the same pool: with every toy free, idle cats end up playing', () => {
  const os = playroom();
  const cats = [1, 2, 3, 4].map((id) => idleCat(os, id));
  const seen = new Set<string>();
  runFor(os, 240, () => {
    for (const ch of cats) if (ch.activity) seen.add(ch.activity.id);
  });
  const toys = ['scratch', 'box', 'tunnel', 'yarn', 'teaser'].filter((t) => seen.has(t));
  assert.ok(toys.length >= 2, `cats played with ${[...seen].join(', ')}`);
});
