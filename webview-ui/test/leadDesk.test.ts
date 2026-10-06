/**
 * The team lead desk and the Tasks whiteboard of default revision 9: the lead
 * chair reserved for the root of the cat tree (the desk follows a new root),
 * the old behavior in an office with no lead chair, the whiteboard hit test
 * and its live sticky notes, and the Hierarchy hint.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeAll, beforeEach, test } from 'vitest';

import { buildFurnitureCatalog } from '../../core/src/assets/build.ts';
import { CatOfficeFeed } from '../src/catOfficeFeed.js';
import type { CatProfile } from '../src/cats/catsApi.js';
import { leadHint } from '../src/cats/hierarchy.js';
import { WHITEBOARD_INK, WHITEBOARD_NOTE_COLORS } from '../src/constants.js';
import type { ResidentCat } from '../src/office/engine/officeState.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import { mulberry32 } from '../src/office/engine/socialMoves.js';
import {
  countTasks,
  whiteboardAt,
  whiteboardSprite,
  whiteboardTooltip,
} from '../src/office/engine/whiteboardNotes.js';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.js';
import { findPath } from '../src/office/layout/tileMap.js';
import type { OfficeLayout } from '../src/office/types.js';
import { CharacterState, Direction } from '../src/office/types.js';
import { OrchestratorEvents } from '../src/orchestratorEvents.js';

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');
const CHAIR = 'f-lead-chair';
const BOARD = 'f-tasks-whiteboard';
/** The doorway from the main work room to the lounge. */
const DOOR = { col: 10, row: 15 };

beforeAll(() => {
  const catalog = buildFurnitureCatalog(ASSETS);
  const sprites = Object.fromEntries(catalog.map((c) => [c.id, [['']]]));
  assert.ok(buildDynamicCatalog({ catalog, sprites } as never));
});

const realRandom = Math.random;
beforeEach(() => {
  Math.random = mulberry32(7);
});
afterEach(() => {
  Math.random = realRandom;
});

function layout(rev = 9): OfficeLayout {
  const file = path.join(ASSETS, `default-layout-${rev}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as OfficeLayout;
}

const resident = (id: number, extra: Partial<ResidentCat> = {}): ResidentCat => ({
  id,
  name: `cat${id}`,
  appearance: {},
  working: false,
  ...extra,
});

/** Cats 1..n as residents; `lead` is the root of the tree. */
function office(n: number, lead: number, l = layout()) {
  const os = new OfficeState(l);
  for (let id = 1; id <= n; id++) os.addAgent(id, 0, 0, undefined, true);
  os.setResidentCats(
    Array.from({ length: n }, (_, i) =>
      resident(i + 1, i + 1 === lead ? { lead: true, working: true } : { working: true }),
    ),
  );
  return os;
}

function runUntil(os: OfficeState, done: () => boolean, max = 60) {
  for (let t = 0; t < max; t += 0.05) {
    if (done()) return;
    os.update(0.05);
  }
  assert.fail('condition never held');
}

const seatedAt = (os: OfficeState, id: number, seatId: string) => {
  const ch = os.characters.get(id)!;
  const seat = os.seats.get(seatId)!;
  return (
    ch.seatId === seatId &&
    ch.tileCol === seat.seatCol &&
    ch.tileRow === seat.seatRow &&
    ch.state === CharacterState.TYPE
  );
};

test('revision 9: the lead chair faces the workers and every work seat is in reach', () => {
  const os = new OfficeState(layout());
  assert.equal(os.leadChairSeat(), CHAIR);
  const lead = os.seats.get(CHAIR)!;
  assert.equal(lead.facingDir, Direction.DOWN, 'the lead faces the room');
  // The worker seats of the main room face the lead desk (up) or the pod table (sideways).
  const room = [...os.seats.values()].filter((s) => s.seatCol <= 9 && s.uid !== CHAIR);
  assert.equal(room.length, 6, 'the six worker seats of revision 8 stay');
  for (const s of room) assert.ok(s.seatRow > lead.seatRow, `${s.uid} sits below the lead`);
  for (const s of [lead, ...room]) {
    const blocked = new Set(os.blockedTiles);
    blocked.delete(`${s.seatCol},${s.seatRow}`);
    const walk = findPath(DOOR.col, DOOR.row, s.seatCol, s.seatRow, os.tileMap, blocked);
    assert.ok(walk.length > 0, `${s.uid} is reachable from the doorway`);
  }
});

test('the team lead takes the lead chair; no other cat sits there', () => {
  const os = office(12, 1);
  assert.equal(os.characters.get(1)!.seatId, CHAIR);
  for (let id = 2; id <= 12; id++) assert.notEqual(os.characters.get(id)!.seatId, CHAIR);
  // A seat drag or a saved seat does not put another cat there.
  os.reassignSeat(2, CHAIR);
  assert.notEqual(os.characters.get(2)!.seatId, CHAIR);
  os.addAgent(40, 0, 0, CHAIR, true);
  assert.notEqual(os.characters.get(40)!.seatId, CHAIR);
  // The lead works there.
  runUntil(os, () => seatedAt(os, 1, CHAIR));
});

test('a new root moves to the lead desk; the old one gives the chair up', () => {
  const os = office(3, 1);
  runUntil(os, () => seatedAt(os, 1, CHAIR));
  // The user promotes cat 2 in the Hierarchy tab: the server moves the lead flag.
  os.setResidentCats([
    resident(1, { working: true }),
    resident(2, { lead: true, working: true }),
    resident(3, { working: true }),
  ]);
  assert.equal(os.characters.get(2)!.seatId, CHAIR);
  const old = os.characters.get(1)!;
  assert.ok(old.seatId && old.seatId !== CHAIR, 'the old lead has another seat');
  assert.equal([...os.seats.values()].filter((s) => s.uid === CHAIR && s.assigned).length, 1);
  runUntil(os, () => seatedAt(os, 2, CHAIR));
});

test('in a full office the old lead stands up from the chair for the new one', () => {
  const os = office(3, 1);
  runUntil(os, () => seatedAt(os, 1, CHAIR));
  // Every other seat is taken: no free seat is left for the old lead.
  for (const s of os.seats.values()) s.assigned = true;
  os.setResidentCats([
    resident(1, { working: true }),
    resident(2, { lead: true, working: true }),
    resident(3, { working: true }),
  ]);
  const old = os.characters.get(1)!;
  const seat = os.seats.get(CHAIR)!;
  assert.equal(os.characters.get(2)!.seatId, CHAIR);
  assert.equal(old.seatId, null);
  assert.equal(old.state, CharacterState.IDLE, 'the old lead no longer types on the chair');
  assert.ok(old.tileCol !== seat.seatCol || old.tileRow !== seat.seatRow, 'it left the chair');
  runUntil(os, () => seatedAt(os, 2, CHAIR));
});

test('the lead walks back to its desk when a task turn starts', () => {
  const os = office(2, 1);
  const lead = os.characters.get(1)!;
  lead.state = CharacterState.IDLE;
  lead.tileCol = 5;
  lead.tileRow = 18;
  lead.x = 5 * 16 + 8;
  lead.y = 18 * 16 + 8;
  lead.path = [];
  os.setResidentCats([resident(1, { lead: true, working: false }), resident(2)]);
  os.setResidentCats([resident(1, { lead: true, working: true }), resident(2)]);
  runUntil(os, () => seatedAt(os, 1, CHAIR));
});

test('an office with no lead chair keeps the old seating', () => {
  const l = layout(8);
  const os = office(3, 1, l);
  assert.equal(os.leadChairSeat(), null);
  // Any seat goes: the lead got the first free one, like any cat.
  assert.ok(os.characters.get(1)!.seatId);
  os.addAgent(9, 0, 0, undefined, true);
  assert.ok(os.characters.get(9)!.seatId);
});

test('the server lead flag reaches the office through the cat feed', () => {
  const got: ResidentCat[][] = [];
  const feed = new CatOfficeFeed(
    () => ({ setResidentCats: (list) => got.push(list), setQueuedCats: () => {} }),
    new OrchestratorEvents(),
  );
  feed.handle({
    type: 'catCharacters',
    characters: [
      { catId: 'boss', id: 1, name: 'Barsik', appearance: {}, working: false, lead: true },
      { catId: 'dev', id: 2, name: 'Smokey', appearance: {}, working: false },
    ],
  });
  assert.deepEqual(
    got[0].map((r) => [r.id, r.lead ?? false]),
    [
      [1, true],
      [2, false],
    ],
  );
});

test('the whiteboard hangs where the clock was and takes the click', () => {
  const l = layout();
  const board = l.furniture.find((f) => f.uid === BOARD)!;
  const clock8 = layout(8).furniture.find((f) => f.type === 'CLOCK')!;
  assert.deepEqual([board.col, board.row], [clock8.col, clock8.row]);
  assert.equal(whiteboardAt(board.col * 16 + 20, board.row * 16 + 18, l.furniture)?.uid, BOARD);
  // A click on the clock, the bookshelf or the floor is not a board click.
  const clock = l.furniture.find((f) => f.type === 'CLOCK')!;
  assert.equal(whiteboardAt(clock.col * 16 + 8, clock.row * 16 + 18, l.furniture), undefined);
  assert.equal(whiteboardAt(5 * 16, 15 * 16, l.furniture), undefined);
});

test('the board counts running, waiting and done tasks', () => {
  const counts = countTasks([
    { status: 'running' },
    { status: 'running', flow: { root: 'boss', state: 'working', nodes: [], turns: 1 } },
    { status: 'error', flow: { root: 'boss', state: 'interrupted', nodes: [], turns: 3 } },
    { status: 'done' },
    { status: 'done' },
    { status: 'done' },
    { status: 'error' },
  ]);
  assert.deepEqual(counts, { running: 2, waiting: 1, done: 3 });
  assert.deepEqual(whiteboardTooltip(counts), ['Tasks', '2 running · 1 waiting · 3 done']);
  assert.deepEqual(whiteboardTooltip(null), ['Tasks']);
});

test('the board shows one sticky note per status and updates with the counts', () => {
  const os = new OfficeState(layout());
  const base = () => os.furniture.find((f) => f.uid === BOARD)!.sprite;
  const drawn = () => os.getFurnitureForRender().find((f) => f.uid === BOARD)!.sprite;
  assert.equal(drawn(), base(), 'no counts yet: the plain board');

  const plain: string[][] = Array.from({ length: 32 }, () => Array(32).fill('board'));
  const one = whiteboardSprite(plain, { running: 1, waiting: 0, done: 12 });
  // Note papers: yellow (running), pink (waiting), green (done).
  assert.equal(one[13][3], WHITEBOARD_NOTE_COLORS.running.paper);
  assert.equal(one[13][12], WHITEBOARD_NOTE_COLORS.waiting.paper);
  assert.equal(one[13][21], WHITEBOARD_NOTE_COLORS.done.paper);
  const ink = (s: string[][], x0: number) =>
    s
      .slice(14, 19)
      .map((row) => row.slice(x0, x0 + 7).map((c) => (c === WHITEBOARD_INK ? '#' : '.')));
  assert.deepEqual(
    ink(one, 21).map((r) => r.join('')),
    ['.#..###', '##....#', '.#..###', '.#..#..', '###.###'],
    'the done note reads 12',
  );
  assert.equal(whiteboardSprite(plain, { running: 1, waiting: 0, done: 12 }), one, 'cached');
  assert.notEqual(whiteboardSprite(plain, { running: 2, waiting: 0, done: 12 }), one);

  os.taskCounts = { running: 1, waiting: 2, done: 3 };
  assert.notEqual(drawn(), base(), 'the counts arrive: notes drawn on the board');
});

test('the Hierarchy hint: a lead role off the top, or a root that is no lead', () => {
  const cat = (id: string, role: string, parentId: string | null): CatProfile => ({
    id,
    name: id,
    appearance: {},
    role,
    systemPrompt: '',
    engine: 'claude',
    model: 'sonnet',
    effort: 'medium',
    parentId,
  });
  assert.equal(
    leadHint([cat('Barsik', 'Team lead', null), cat('Mochi', 'Tester', 'Barsik')]),
    null,
  );
  assert.equal(leadHint([cat('Boss', 'Boss', null), cat('Dev', 'Developer', 'Boss')]), null);
  assert.match(
    leadHint([cat('Barsik', 'Team lead', null), cat('Mochi', 'Tech lead', 'Barsik')])!,
    /Mochi has a lead role, but Barsik is at the top/,
  );
  assert.match(
    leadHint([cat('Smokey', 'Developer', null), cat('Barsik', 'Worker', 'Smokey')])!,
    /Smokey is at the top, but its role "Developer" is not a lead/,
  );
  assert.equal(leadHint([]), null);
});
