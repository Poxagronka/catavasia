/**
 * Cat office wiring in the webview: the server feed (resident cats, office
 * messages, flow states, the turn queue) and what the office does with it
 * (names and coats on resident cats, idle vs working, the queue line by the
 * coffee with its markers), plus the task form's default target.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { beforeAll, test } from 'vitest';

import type { ServerMessage } from '../../core/src/messages.js';
import { CatOfficeFeed, type FeedWorld } from '../src/catOfficeFeed.js';
import { defaultTarget } from '../src/components/taskBoard/taskFormat.js';
import { OfficeState, type ResidentCat } from '../src/office/engine/officeState.js';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.js';
import { CharacterState, TileType } from '../src/office/types.js';
import type { OrchestratorEvent } from '../src/orchestratorEvents.js';
import { OrchestratorEvents } from '../src/orchestratorEvents.js';

const PIXEL = [['']];

beforeAll(() => {
  const asset = (id: string, category: string, extra = {}) => ({
    id,
    name: id,
    label: id,
    category,
    file: `${id}.png`,
    width: 16,
    height: 16,
    footprintW: 1,
    footprintH: 1,
    isDesk: false,
    canPlaceOnWalls: false,
    ...extra,
  });
  const catalog = [
    asset('WOODEN_CHAIR', 'chairs'),
    asset('COFFEE', 'misc', { canPlaceOnSurfaces: true }),
  ];
  const sprites = Object.fromEntries(catalog.map((c) => [c.id, PIXEL]));
  assert.ok(buildDynamicCatalog({ catalog, sprites } as never));
});

/** 14x9 floor, desk chairs (1,1),(1,3),(1,5),(1,7), a mug at (10,4). */
function office(): OfficeState {
  const cols = 14;
  const rows = 9;
  const os = new OfficeState({
    version: 1,
    cols,
    rows,
    tiles: new Array<TileType>(cols * rows).fill(TileType.FLOOR_1),
    furniture: [
      ...[1, 3, 5, 7].map((row, i) => ({ uid: `desk${i}`, type: 'WOODEN_CHAIR', col: 1, row })),
      { uid: 'mug', type: 'COFFEE', col: 10, row: 4 },
    ],
  });
  os.social.rng = () => 0.99;
  os.life.activitySocial.rng = () => 0.99;
  os.life.claims.spots.rng = () => 0.99;
  return os;
}

function runFor(os: OfficeState, seconds: number) {
  for (let t = 0; t < seconds; t += 0.05) os.update(0.05);
}

const resident = (id: number, name: string, working = false): ResidentCat => ({
  id,
  name,
  appearance: { breed: 'marmalade' },
  working,
});

// ── Feed ─────────────────────────────────────────────────────────

function feed() {
  const calls: { residents: ResidentCat[][]; queued: number[][] } = { residents: [], queued: [] };
  const world: FeedWorld = {
    setResidentCats: (l) => calls.residents.push(l),
    setQueuedCats: (ids) => calls.queued.push(ids),
  };
  const bus = new OrchestratorEvents();
  const events: OrchestratorEvent[] = [];
  bus.on((e) => events.push(e));
  const f = new CatOfficeFeed(() => world, bus);
  const send = (m: ServerMessage) => f.handle(m);
  send({
    type: 'catCharacters',
    characters: [
      { catId: 'boss', id: 11, name: 'Barsik', appearance: { breed: 'marmalade' }, working: false },
      { catId: 'murka', id: 12, name: 'Murka', appearance: { breed: 'smokey' }, working: true },
      { catId: 'pushok', id: 13, name: 'Pushok', appearance: {}, working: false },
    ],
  });
  return { f, send, calls, events };
}

test('feed: resident cats reach the office with names, coats and the working flag', () => {
  const { calls } = feed();
  assert.deepEqual(
    calls.residents[0].map((r) => [r.id, r.name, r.working]),
    [
      [11, 'Barsik', false],
      [12, 'Murka', true],
      [13, 'Pushok', false],
    ],
  );
});

test('feed: flow states carry the boss and the team as agent ids; interrupted ends like an error', () => {
  const { send, events, f } = feed();
  send({
    type: 'flowStateChanged',
    taskId: 't1',
    state: 'briefing',
    rootCatId: 'boss',
    catIds: ['boss', 'murka', 'pushok'],
  });
  assert.deepEqual(events.at(-1), {
    type: 'flowStateChanged',
    taskId: 't1',
    state: 'briefing',
    bossId: 11,
    participants: [11, 12, 13],
  });
  send({ type: 'flowStateChanged', taskId: 't1', state: 'interrupted' });
  const ended = events.at(-1);
  assert.equal(ended?.type === 'flowStateChanged' && ended.state, 'error');

  // A briefing open when the connection drops ends with an error state.
  send({ type: 'flowStateChanged', taskId: 't2', state: 'briefing', rootCatId: 'murka' });
  f.connectionLost();
  assert.deepEqual(events.at(-1), {
    type: 'flowStateChanged',
    taskId: 't2',
    state: 'error',
    bossId: 12,
    participants: [12],
  });
  const count = events.length;
  f.connectionLost();
  assert.equal(events.length, count, 'each meeting ends once');
});

test('feed: office messages map to agent ids; the brief goes to a teammate; user lines are skipped', () => {
  const { send, events } = feed();
  send({
    type: 'flowStateChanged',
    taskId: 't1',
    state: 'briefing',
    rootCatId: 'boss',
    catIds: ['boss', 'murka', 'pushok'],
  });
  const msg = (from: string, to: string, kind: string, text = 'x') =>
    send({ type: 'catMessage', taskId: 't1', from, to, kind: kind as never, text });
  msg('user', 'boss', 'task');
  msg('boss', 'team', 'brief', 'each worker writes one file');
  msg('boss', 'murka', 'delegate', 'write a.txt');
  msg('murka', 'boss', 'report', 'done');
  msg('office', 'boss', 'nudge');
  msg('boss', 'user', 'final');
  msg('boss', 'ghost', 'delegate');
  const talks = events.filter((e) => e.type === 'catMessage');
  assert.deepEqual(
    talks.map((e) => e.type === 'catMessage' && [e.from, e.to, e.kind, e.text]),
    [
      [11, 12, 'brief', 'each worker writes one file'],
      [11, 12, 'delegate', 'write a.txt'],
      [12, 11, 'report', 'done'],
    ],
  );
});

test('feed: the queue holds cats waiting for a slot, not the ones running a turn', () => {
  const { send, calls } = feed();
  send({ type: 'queueChanged', running: ['murka'], queued: ['pushok', 'murka', 'ghost'], cap: 1 });
  assert.deepEqual(calls.queued.at(-1), [13]);
});

// ── Office ───────────────────────────────────────────────────────

test('resident cats: name label, custom coat sprites, idle between turns, working in a turn', () => {
  const os = office();
  os.setResidentCats([
    resident(1, 'Barsik'),
    { ...resident(2, 'Murka'), appearance: { breed: 'smokey', pattern: 'calico' } },
  ]);
  os.addAgent(1, 0, 0, 'desk0', true);
  os.addAgent(2, 1, 0, 'desk1', true);
  const a = os.characters.get(1)!;
  const b = os.characters.get(2)!;
  assert.equal(a.agentName, 'Barsik');
  assert.equal(a.isActive, false, 'a resident idles between turns');
  assert.equal(a.customSprites, undefined, 'a plain breed uses its palette sheet');
  assert.ok(b.customSprites, 'a custom coat gets runtime sprites');
  assert.ok(b.customSprites.idle[0].length > 0, 'with the idle-activity poses');

  os.setResidentCats([resident(1, 'Barsik', true), resident(2, 'Murka')]);
  assert.equal(a.isActive, true, 'its turn: it works at its desk');
  runFor(os, 6);
  assert.equal(a.state, CharacterState.TYPE);
});

test('queue: queued cats line up by the coffee with a marker, then go back to their life', () => {
  const os = office();
  os.setResidentCats([resident(1, 'A'), resident(2, 'B'), resident(3, 'C')]);
  for (const [id, seat] of [
    [1, 'desk0'],
    [2, 'desk1'],
    [3, 'desk2'],
  ] as const)
    os.addAgent(id, 0, 0, seat, true);

  os.setQueuedCats([2, 3]);
  runFor(os, 0.1);
  assert.deepEqual(os.scenes.queuedCats(), [2, 3]);
  const line = os.queueTiles(2);
  assert.equal(line.length, 2);
  // The reservations hold the line tiles for the queued cats.
  const held = new Map(os.scenes.meetingSeats());
  assert.equal(held.get(`${line[0].col},${line[0].row}`), 2);
  assert.equal(held.get(`${line[1].col},${line[1].row}`), 3);
  runFor(os, 15);
  const b = os.characters.get(2)!;
  assert.deepEqual([b.tileCol, b.tileRow], [line[0].col, line[0].row], 'first in line');
  // Next to the mug (10,4).
  assert.ok(Math.abs(b.tileCol - 10) + Math.abs(b.tileRow - 4) <= 2);
  assert.ok(os.scenes.owns(2), 'the line holds it: no idle activity');

  // Cat 2's turn starts: it leaves the line and works; cat 3 moves up.
  os.setQueuedCats([3]);
  os.setResidentCats([resident(1, 'A'), resident(2, 'B', true), resident(3, 'C')]);
  runFor(os, 0.1);
  assert.equal(os.scenes.owns(2), false);
  assert.deepEqual(os.scenes.queuedCats(), [3]);
  runFor(os, 15);
  assert.equal(b.state, CharacterState.TYPE, 'at its desk');
  const c = os.characters.get(3)!;
  assert.deepEqual([c.tileCol, c.tileRow], [line[0].col, line[0].row]);

  os.setQueuedCats([]);
  runFor(os, 0.1);
  assert.deepEqual(os.scenes.queuedCats(), []);
  assert.equal(os.scenes.owns(3), false, 'back to its idle life');
});

test('task form: a new task goes to the team when there are cats', () => {
  assert.equal(defaultTarget([]), '');
  assert.equal(
    defaultTarget([
      { id: 'team', label: 'Team: Barsik leads' },
      { id: 'boss', label: 'Barsik' },
    ]),
    'team',
  );
  assert.equal(
    defaultTarget([{ id: 'team', label: 'Team', disabled: 'codex adapter not ready' }]),
    '',
  );
});
