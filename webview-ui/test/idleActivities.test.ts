/**
 * Idle activities: a cat that is not working picks coffee, a nap or a wander,
 * never the same one twice in a row, never a spot another cat holds, and drops
 * it the moment its agent starts working.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { beforeAll, test } from 'vitest';

import type { IdleActivityDef } from '../src/office/engine/idleActivities.js';
import { chooseIdleActivity, IDLE_ACTIVITIES } from '../src/office/engine/idleActivities.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.js';
import type { ActivitySpot, OfficeLayout } from '../src/office/types.js';
import { CharacterState, Direction, TileType } from '../src/office/types.js';

// Sprite pixels are never drawn here: one transparent cell per asset is enough.
const PIXEL = [['']];

beforeAll(() => {
  const asset = (id: string, category: string, w: number, h: number, extra = {}) => ({
    id,
    name: id,
    label: id,
    category,
    file: `${id}.png`,
    width: w * 16,
    height: h * 16,
    footprintW: w,
    footprintH: h,
    isDesk: false,
    canPlaceOnWalls: false,
    ...extra,
  });
  const catalog = [
    asset('SOFA_FRONT', 'chairs', 2, 1, { orientation: 'front' }),
    asset('WOODEN_CHAIR', 'chairs', 1, 1),
    asset('COFFEE', 'misc', 1, 1, { canPlaceOnSurfaces: true }),
    asset('COFFEE_TABLE', 'desks', 1, 1),
  ];
  const sprites = Object.fromEntries(catalog.map((c) => [c.id, PIXEL]));
  assert.ok(buildDynamicCatalog({ catalog, sprites } as never));
});

/**
 * 10x7 floor. Sofa seats at (2,1),(3,1); desk chairs at (8,1),(8,3);
 * a mug at (6,5) with three free floor tiles around it.
 */
function office(): OfficeState {
  const cols = 10;
  const rows = 7;
  const layout: OfficeLayout = {
    version: 1,
    cols,
    rows,
    tiles: new Array<TileType>(cols * rows).fill(TileType.FLOOR_1),
    furniture: [
      { uid: 'sofa', type: 'SOFA_FRONT', col: 2, row: 1 },
      { uid: 'chairA', type: 'WOODEN_CHAIR', col: 8, row: 1 },
      { uid: 'chairB', type: 'WOODEN_CHAIR', col: 8, row: 3 },
      { uid: 'mug', type: 'COFFEE', col: 6, row: 5 },
      // Not a coffee spot: only the mug is.
      { uid: 'table', type: 'COFFEE_TABLE', col: 0, row: 5 },
    ],
  };
  return new OfficeState(layout);
}

/** An idle cat at a desk chair, ready to pick an activity. */
function idleCat(os: OfficeState, id: number, seat: string) {
  os.addAgent(id, 0, 0, seat, true);
  os.setAgentActive(id, false);
  const ch = os.characters.get(id)!;
  ch.state = CharacterState.IDLE;
  return ch;
}

function runFor(os: OfficeState, seconds: number) {
  for (let t = 0; t < seconds; t += 0.05) os.update(0.05);
}

function spot(key: string): ActivitySpot {
  const [col, row] = key.split(',').map(Number);
  return { key, col, row, facing: Direction.DOWN, onFurniture: false, offsetY: 0 };
}

test('never picks the same activity twice in a row while another is available', () => {
  const spotSets = new Map([
    ['coffee', { spots: [spot('1,1')], fallback: [] }],
    ['sleep', { spots: [spot('2,2')], fallback: [] }],
  ]);
  for (let i = 0; i < 200; i++) {
    const roll = i / 200;
    for (const last of ['wander', 'coffee', 'sleep']) {
      const pick = chooseIdleActivity(last, spotSets, new Set(), () => roll);
      assert.ok(pick);
      assert.notEqual(pick.def.id, last, `rand=${roll} repeated ${last}`);
    }
  }
});

test('repeats only when nothing else is available', () => {
  const onlyWander = IDLE_ACTIVITIES.filter((d) => d.id === 'wander');
  const pick = chooseIdleActivity('wander', new Map(), new Set(), Math.random, onlyWander);
  assert.equal(pick?.def.id, 'wander');
});

test('weights decide the pick', () => {
  const defs: IdleActivityDef[] = [
    { id: 'a', weight: 1, durationSec: [1, 1], frames: [], frameSec: 1 },
    { id: 'b', weight: 3, durationSec: [1, 1], frames: [], frameSec: 1 },
  ];
  // Rolls below 1/4 land on "a", the rest on "b".
  assert.equal(chooseIdleActivity(null, new Map(), new Set(), () => 0.2, defs)?.def.id, 'a');
  assert.equal(chooseIdleActivity(null, new Map(), new Set(), () => 0.3, defs)?.def.id, 'b');
});

test('skips taken spots and falls back to the floor when every sofa seat is taken', () => {
  const sleepOnly = IDLE_ACTIVITIES.filter((d) => d.id === 'sleep');
  const spotSets = new Map([
    ['sleep', { spots: [spot('2,1'), spot('3,1')], fallback: [spot('2,2')] }],
  ]);

  const free = chooseIdleActivity(null, spotSets, new Set(['2,1']), () => 0, sleepOnly);
  assert.equal(free?.spot?.key, '3,1', 'the free sofa seat');

  const floor = chooseIdleActivity(null, spotSets, new Set(['2,1', '3,1']), () => 0, sleepOnly);
  assert.equal(floor?.spot?.key, '2,2', 'floor near the sofa');

  const none = chooseIdleActivity(
    null,
    spotSets,
    new Set(['2,1', '3,1', '2,2']),
    () => 0,
    sleepOnly,
  );
  assert.equal(none, null, 'no free spot at all: nothing to pick');
});

test('office spots: sofa seats to nap on, floor around the mug for coffee', () => {
  const os = office();
  const sleep = os.activitySpots.get('sleep')!;
  assert.deepEqual(sleep.spots.map((s) => s.key).sort(), ['2,1', '3,1']);
  assert.ok(sleep.spots.every((s) => s.onFurniture));
  assert.ok(sleep.fallback.length > 0 && sleep.fallback.every((s) => !s.onFurniture));
  const coffee = os.activitySpots.get('coffee')!.spots;
  assert.deepEqual(coffee.map((s) => s.key).sort(), ['5,5', '6,4', '6,6', '7,5']);
  const below = coffee.find((s) => s.key === '6,6')!;
  assert.equal(below.facing, Direction.UP, 'the cat faces the mug');
});

test('two napping cats take two different sofa seats, a third naps on the floor', () => {
  const os = office();
  os.addAgent(3, 0, 0, undefined, true);
  const cats = [idleCat(os, 1, 'chairA'), idleCat(os, 2, 'chairB')];
  // Cat 3 has no desk chair left: it gets a seat anyway, which may be a sofa seat.
  const third = os.characters.get(3)!;
  third.seatId = null;
  os.setAgentActive(3, false);
  third.state = CharacterState.IDLE;
  cats.push(third);

  for (const ch of cats) assert.ok(os.forceIdleActivity(ch.id, 'sleep'));
  runFor(os, 10);

  const keys = cats.map((ch) => ch.activity?.spot?.key);
  assert.equal(new Set(keys).size, 3, `spots must differ: ${keys.join(' ')}`);
  for (const ch of cats) assert.equal(ch.state, CharacterState.ACTIVITY);
  const onSofa = cats.filter((ch) => ch.activity?.spot?.onFurniture).length;
  assert.equal(onSofa, 2, 'both sofa seats used, the third cat sleeps on the floor');
});

test('work interrupts any activity: the cat leaves at once and walks to its desk', () => {
  const os = office();
  const ch = idleCat(os, 1, 'chairA');
  assert.ok(os.forceIdleActivity(1, 'sleep'));
  runFor(os, 10);
  assert.equal(ch.state, CharacterState.ACTIVITY);

  os.setAgentActive(1, true);
  os.update(0.05);
  os.update(0.05);
  assert.equal(ch.activity, null);
  assert.equal(ch.state, CharacterState.WALK, 'on the way to the desk');
  runFor(os, 10);
  assert.equal(ch.state, CharacterState.TYPE);
  assert.deepEqual([ch.tileCol, ch.tileRow], [8, 1]);
});

test('an idle cat goes on to a different activity after one ends', () => {
  const os = office();
  const ch = idleCat(os, 1, 'chairA');
  assert.ok(os.forceIdleActivity(1, 'coffee'));
  runFor(os, 30);
  assert.equal(ch.lastActivityId, 'coffee');
  assert.notEqual(ch.activity?.id, 'coffee');
});

test('a finished task cat stays, idle, and its click target is the task', () => {
  const os = office();
  const ch = idleCat(os, 7, 'chairA');
  os.setTaskFinished(7, 'task-abc');
  assert.equal(ch.taskId, 'task-abc');
  assert.equal(ch.isActive, false);
  // The canvas click hit-test finds the cat; App opens ch.taskId for it.
  const hit = os.getCharacterAt(ch.x, ch.y - 4);
  assert.equal(hit, 7);
  assert.equal(os.characters.get(hit!)?.taskId, 'task-abc');
});

test('"waiting for input" stays through a nap and clears when the agent works again', () => {
  const os = office();
  const ch = idleCat(os, 1, 'chairA');
  os.showWaitingBubble(1, true);
  assert.ok(os.forceIdleActivity(1, 'sleep'));
  runFor(os, 10);
  assert.equal(ch.state, CharacterState.ACTIVITY);
  assert.equal(ch.bubbleType, 'waiting');
  assert.equal(ch.waitingAwaitingInput, true);

  os.setAgentActive(1, true);
  assert.equal(ch.bubbleType, null);
});
