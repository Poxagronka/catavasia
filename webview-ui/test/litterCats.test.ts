/**
 * Agent cats and the litter boxes: a rare idle visit (dig, squat, cover,
 * proud), the pile landing as the cat covers it, a hooded box hiding the
 * cat, refusal of an overflowing box (another box, else the floor), one cat
 * per box, work always first, zoomies, and paths around floor poops.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { afterEach, beforeAll, test } from 'vitest';

import { LITTER_ACTIVITY_WEIGHT, PET_LITTER_CAPACITY } from '../src/constants.js';
import { isSprinting, peekNow } from '../src/office/engine/characters.js';
import { IDLE_ACTIVITIES } from '../src/office/engine/idleActivities.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.js';
import { findPath, setAvoidTiles } from '../src/office/layout/tileMap.js';
import type { OfficeLayout, PlacedFurniture } from '../src/office/types.js';
import { CharacterState, TileType } from '../src/office/types.js';

const realRandom = Math.random;

beforeAll(() => {
  const asset = (id: string) => ({
    id,
    name: id,
    label: id,
    category: 'misc',
    file: `${id}.png`,
    width: 16,
    height: 16,
    footprintW: 1,
    footprintH: 1,
    isDesk: false,
    canPlaceOnWalls: false,
    backgroundTiles: 1,
  });
  const catalog = ['LITTER_BOX', 'LITTER_BOX_HOODED', 'LITTER_BOX_SMART'].map(asset);
  const sprites = Object.fromEntries(catalog.map((c) => [c.id, [['']]]));
  assert.ok(buildDynamicCatalog({ catalog, sprites } as never));
});

afterEach(() => {
  Math.random = realRandom;
  setAvoidTiles(new Set());
});

function office(furniture: PlacedFurniture[], cols = 10, rows = 6): OfficeState {
  const layout: OfficeLayout = {
    version: 1,
    cols,
    rows,
    tiles: new Array<TileType>(cols * rows).fill(TileType.FLOOR_1),
    furniture,
  };
  return new OfficeState(layout);
}

function idleCat(os: OfficeState, id: number, col = 0, row = 5) {
  os.addAgent(id, 0, 0, undefined, true);
  os.setAgentActive(id, false);
  const ch = os.characters.get(id)!;
  Object.assign(ch, { state: CharacterState.IDLE, tileCol: col, tileRow: row });
  Object.assign(ch, { x: col * 16 + 8, y: row * 16 + 8, path: [], wanderTimer: 1e9 });
  return ch;
}

function runUntil(os: OfficeState, done: () => boolean, max = 40, each?: () => void) {
  for (let t = 0; t < max; t += 0.05) {
    if (done()) return;
    os.update(0.05);
    each?.();
  }
  assert.ok(done(), 'timed out');
}

const BOX: PlacedFurniture = { uid: 'a', type: 'LITTER_BOX', col: 3, row: 2 };
const SMART: PlacedFurniture = { uid: 'b', type: 'LITTER_BOX_SMART', col: 8, row: 2 };
const HOOD: PlacedFurniture = { uid: 'h', type: 'LITTER_BOX_HOODED', col: 3, row: 2 };

test('a litter visit is a rare idle pick; its follow-ups are never picked', () => {
  const weights = IDLE_ACTIVITIES.filter((d) => !d.work).map((d) => d.weight);
  const total = weights.reduce((a, b) => a + b, 0);
  for (const id of ['litter', 'litterHood']) {
    assert.equal(IDLE_ACTIVITIES.find((d) => d.id === id)?.weight, LITTER_ACTIVITY_WEIGHT);
  }
  assert.ok((2 * LITTER_ACTIVITY_WEIGHT) / total < 0.05);
  for (const id of ['litterRefuse', 'litterFloor', 'zoomies']) {
    assert.equal(IDLE_ACTIVITIES.find((d) => d.id === id)?.weight, 0);
  }
});

test('an agent cat digs, squats and covers; the pile lands as it covers', () => {
  Math.random = () => 0.9; // no zoomies
  const os = office([BOX]);
  const ch = idleCat(os, 1);
  assert.ok(os.forceIdleActivity(1, 'litter'));
  runUntil(os, () => ch.activity?.part === 'loop');
  assert.equal(os.petCare.world.boxCount('a'), 0);
  runUntil(os, () => ch.activity?.part === 'outro');
  os.update(0.05);
  assert.equal(os.petCare.world.boxCount('a'), 1);
  runUntil(os, () => ch.lastActivityId === 'litter');
  // The proud exit: one step off the box.
  runUntil(os, () => ch.state === CharacterState.IDLE);
  assert.notDeepEqual([ch.tileCol, ch.tileRow], [BOX.col, BOX.row]);
  assert.equal(os.petCare.world.boxCount('a'), 1);
});

test('inside a hooded box only the face shows, and only while inside', () => {
  const os = office([HOOD]);
  const ch = idleCat(os, 1);
  assert.ok(os.forceIdleActivity(1, 'litterHood'));
  runUntil(os, () => ch.state === CharacterState.ACTIVITY);
  assert.equal(peekNow(ch), undefined, 'walks in visibly');
  runUntil(os, () => peekNow(ch) !== undefined);
  assert.equal(peekNow(ch)?.kind, 'face');
  runUntil(os, () => ch.activity?.part === 'outro' && peekNow(ch) === undefined);
});

test('an overflowing box: the cat grimaces, refuses it and uses the other box', () => {
  Math.random = () => 0.9;
  const os = office([BOX, SMART]);
  os.petCare.world.boxes.set('a', PET_LITTER_CAPACITY);
  const ch = idleCat(os, 1);
  assert.ok(os.forceIdleActivity(1, 'litter', '3,2'));
  runUntil(os, () => ch.activity?.id === 'litterRefuse');
  runUntil(os, () => ch.activity?.id === 'litter' && ch.activity.spot?.itemUid === 'b');
  runUntil(os, () => ch.lastActivityId === 'litter');
  assert.equal(os.petCare.world.boxCount('a'), PET_LITTER_CAPACITY);
  assert.equal(os.petCare.world.boxCount('b'), 1);
});

test('every box overflowing: an accident on the floor, off the box', () => {
  const os = office([BOX]);
  os.petCare.world.boxes.set('a', PET_LITTER_CAPACITY);
  const ch = idleCat(os, 1);
  assert.ok(os.forceIdleActivity(1, 'litter'));
  runUntil(os, () => ch.lastActivityId === 'litterFloor');
  const poops = os.petCare.world.floorPoops;
  assert.equal(poops.length, 1);
  assert.notDeepEqual([poops[0].col, poops[0].row], [BOX.col, BOX.row]);
});

test('one cat per box: a second cat cannot take a box in use', () => {
  const os = office([BOX]);
  const a = idleCat(os, 1);
  const b = idleCat(os, 2, 5, 5);
  assert.ok(os.forceIdleActivity(1, 'litter'));
  runUntil(os, () => a.state === CharacterState.ACTIVITY);
  assert.ok(os.takenBy(b).has('3,2'));
  assert.equal(os.forceIdleActivity(2, 'litter'), false);
});

test('work comes first: a working cat never goes, a visit stops at once, no pile', () => {
  const os = office([BOX]);
  const ch = idleCat(os, 1);
  os.setAgentActive(1, true);
  assert.equal(os.forceIdleActivity(1, 'litter'), false);
  os.setAgentActive(1, false);
  ch.state = CharacterState.IDLE;
  assert.ok(os.forceIdleActivity(1, 'litter'));
  runUntil(os, () => ch.activity?.part === 'loop');
  os.setAgentActive(1, true);
  os.update(0.05);
  assert.equal(ch.activity, null);
  runUntil(os, () => ch.state !== CharacterState.ACTIVITY, 5);
  assert.equal(os.petCare.world.boxCount('a'), 0);
});

test('zoomies after a visit: sprints to far tiles, faster than a walk', () => {
  Math.random = () => 0.01; // zoomies, the fewest dashes
  const os = office([BOX], 14, 6);
  const ch = idleCat(os, 1);
  assert.ok(os.forceIdleActivity(1, 'litter'));
  runUntil(os, () => ch.lastActivityId === 'litter');
  assert.equal(ch.activity?.id, 'zoomies');
  runUntil(os, () => ch.state === CharacterState.WALK);
  assert.ok(isSprinting(ch));
  const x0 = ch.x + ch.y;
  os.update(0.1);
  // A walk covers 4.8 px in 0.1 s; a sprint covers more.
  assert.ok(Math.abs(ch.x + ch.y - x0) > 6);
  runUntil(os, () => !ch.activity && ch.lastActivityId === 'zoomies');
});

test('paths go around a floor poop when they can, and a passing cat may grimace', () => {
  Math.random = () => 0; // always grimace
  const os = office([], 7, 3);
  os.petCare.world.floorPoop(3, 1);
  const ch = idleCat(os, 1, 0, 1);
  os.update(0.05);
  const around = findPath(0, 1, 6, 1, os.tileMap, os.blockedTiles);
  assert.ok(!around.some((t) => t.col === 3 && t.row === 1));
  // A one-tile corridor: the poop tile is the only way, so the path goes through.
  const corridor = office([], 7, 1);
  corridor.petCare.world.floorPoop(3, 0);
  corridor.update(0.05);
  const through = findPath(0, 0, 6, 0, corridor.tileMap, corridor.blockedTiles);
  assert.ok(through.some((t) => t.col === 3));
  os.update(0.05);
  ch.path = around;
  ch.state = CharacterState.WALK;
  let grimaced = false;
  runUntil(
    os,
    () => ch.state !== CharacterState.WALK,
    10,
    () => {
      grimaced ||= (ch.grimaceSec ?? 0) > 0;
    },
  );
  assert.ok(grimaced);
});
