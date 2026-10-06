/**
 * The Cat CEO office of the bundled default (revision 6): the room and its
 * doorway, the executive chair reserved for the Cat CEO (no other cat takes
 * it), the Cat CEO back at its desk when a run starts and after a review
 * talk, and the head-Area fallback of an office with no executive chair.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeAll, beforeEach, test } from 'vitest';

import { buildFurnitureCatalog } from '../../core/src/assets/build.ts';
import { OfficeState } from '../src/office/engine/officeState.js';
import { mulberry32 } from '../src/office/engine/socialMoves.js';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.js';
import { findPath } from '../src/office/layout/tileMap.js';
import type { OfficeLayout } from '../src/office/types.js';
import { CharacterState } from '../src/office/types.js';

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');
const CEO = 99;
const CHAIR = 'f-ceo-chair';
/** A main-room floor tile, left of the lounge. */
const MAIN_ROOM = { col: 5, row: 15 };

beforeAll(() => {
  const catalog = buildFurnitureCatalog(ASSETS);
  const sprites = Object.fromEntries(catalog.map((c) => [c.id, [['']]]));
  assert.ok(buildDynamicCatalog({ catalog, sprites } as never));
});

// Idle picks roll Math.random: seed it so every run walks the same way.
const realRandom = Math.random;
beforeEach(() => {
  Math.random = mulberry32(11);
});
afterEach(() => {
  Math.random = realRandom;
});

function layout(): OfficeLayout {
  const file = path.join(ASSETS, 'default-layout-6.json');
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as OfficeLayout;
}

function runUntil(os: OfficeState, done: () => boolean, max = 60) {
  for (let t = 0; t < max; t += 0.05) {
    if (done()) return;
    os.update(0.05);
  }
  assert.fail('condition never held');
}

/** The default office with `cats` plain cats and the Cat CEO as residents. */
function office(cats: number, ceoWorking = false) {
  const os = new OfficeState(layout());
  for (let id = 1; id <= cats; id++) os.addAgent(id, 0, 0, undefined, true);
  os.addAgent(CEO, 0, 0, undefined, true);
  os.setResidentCats([
    ...Array.from({ length: cats }, (_, i) => ({
      id: i + 1,
      name: `cat${i + 1}`,
      appearance: {},
      working: true,
    })),
    { id: CEO, name: 'Cat CEO', appearance: {}, working: ceoWorking, ceo: true },
  ]);
  return os;
}

const atChair = (os: OfficeState) => {
  const ceo = os.characters.get(CEO)!;
  const seat = os.seats.get(CHAIR)!;
  return (
    ceo.seatId === CHAIR &&
    ceo.tileCol === seat.seatCol &&
    ceo.tileRow === seat.seatRow &&
    ceo.state === CharacterState.TYPE
  );
};

test('revision 6 has the furnished Cat CEO office, in reach from the main room', () => {
  const l = layout();
  assert.equal(l.layoutRevision, 6);
  const types = l.furniture.filter((f) => f.col >= 30).map((f) => f.type);
  for (const t of [
    'EXECUTIVE_DESK',
    'EXECUTIVE_CHAIR_FRONT',
    'PC_BACK',
    'DOUBLE_BOOKSHELF',
    'PLANT',
    'CEO_PLAQUE',
  ]) {
    assert.ok(types.includes(t), `${t} in the CEO office`);
  }
  assert.ok(l.carpetTiles?.[14 * l.cols + 33], 'a rug under the desk');
  const os = new OfficeState(l);
  const seat = os.seats.get(CHAIR)!;
  assert.equal(os.ceoChairSeat(), CHAIR);
  const blocked = new Set(os.blockedTiles);
  blocked.delete(`${seat.seatCol},${seat.seatRow}`);
  const walk = findPath(
    MAIN_ROOM.col,
    MAIN_ROOM.row,
    seat.seatCol,
    seat.seatRow,
    os.tileMap,
    blocked,
  );
  assert.ok(walk.length > 0, 'the CEO chair is reachable from the main room');
  assert.ok(
    walk.some((t) => t.col === 29),
    'the way goes through the doorway in the playroom wall',
  );
});

test('the Cat CEO takes the executive chair; no other cat sits there', () => {
  // More cats than the other seats: the last ones stand, the chair stays free.
  const os = office(20);
  assert.equal(os.characters.get(CEO)!.seatId, CHAIR);
  for (let id = 1; id <= 20; id++) assert.notEqual(os.characters.get(id)!.seatId, CHAIR);
  // A cat asked to the chair (seat drag, a saved seat) is refused.
  os.reassignSeat(1, CHAIR);
  assert.notEqual(os.characters.get(1)!.seatId, CHAIR);
  os.addAgent(50, 0, 0, CHAIR, true);
  assert.notEqual(os.characters.get(50)!.seatId, CHAIR);
  // A briefing never seats a cat on it.
  assert.ok(!os.planMeeting()?.seats.some((s) => s.uid === CHAIR));
});

test('the chair stays free for the Cat CEO when it joins after the other cats', () => {
  const os = new OfficeState(layout());
  for (let id = 1; id <= 20; id++) os.addAgent(id, 0, 0, undefined, true);
  for (let id = 1; id <= 20; id++) assert.notEqual(os.characters.get(id)!.seatId, CHAIR);
  os.setResidentCats([{ id: CEO, name: 'Cat CEO', appearance: {}, working: false, ceo: true }]);
  os.addAgent(CEO, 0, 0, undefined, true);
  assert.equal(os.characters.get(CEO)!.seatId, CHAIR);
});

test('a run sends the idle Cat CEO back to its desk to work', () => {
  const os = office(2);
  const ceo = os.characters.get(CEO)!;
  // Idle between runs: it gets up and wanders off to the main room.
  ceo.state = CharacterState.IDLE;
  ceo.tileCol = MAIN_ROOM.col;
  ceo.tileRow = MAIN_ROOM.row;
  ceo.x = MAIN_ROOM.col * 16 + 8;
  ceo.y = MAIN_ROOM.row * 16 + 8;
  ceo.path = [];
  // A review starts: the server marks the Cat CEO working.
  os.setResidentCats([
    { id: 1, name: 'cat1', appearance: {}, working: true },
    { id: 2, name: 'cat2', appearance: {}, working: true },
    { id: CEO, name: 'Cat CEO', appearance: {}, working: true, ceo: true },
  ]);
  runUntil(os, () => atChair(os));
});

test('after the review talk the Cat CEO walks back to its desk', () => {
  const os = office(2, true);
  runUntil(os, () => atChair(os));
  os.scenes.handle({
    type: 'catMessage',
    from: CEO,
    to: 1,
    kind: 'review',
    text: '88 · neat split',
  });
  let away = false;
  runUntil(os, () => {
    const ceo = os.characters.get(CEO)!;
    if (os.scenes.talkPhase(CEO) === 'speak') away = ceo.tileCol < 29;
    return away && os.scenes.talkPhase(CEO) === null && atChair(os);
  });
});

test('an office with no executive chair keeps the head-Area desk', () => {
  const l = layout();
  l.furniture = l.furniture.filter((f) => !f.type.startsWith('EXECUTIVE_CHAIR'));
  const os = new OfficeState(l);
  assert.equal(os.ceoChairSeat(), null);
  os.addAgent(CEO, 0, 0, undefined, true);
  os.setResidentCats([{ id: CEO, name: 'Cat CEO', appearance: {}, working: false, ceo: true }]);
  // No head Area either: the Cat CEO keeps an ordinary seat like any cat.
  assert.ok(os.characters.get(CEO)!.seatId);
});
