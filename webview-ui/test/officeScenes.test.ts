/**
 * Office scenes: work talks (walk-up, bubbles, reply, return to the desk,
 * queueing, interrupting idle activities), the briefing meeting (room pick,
 * reserved chairs that outrank a nap, boss at the head, return to desks) and
 * the bubble text (truncation, wrapping).
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { beforeAll, test } from 'vitest';

import { OfficeState } from '../src/office/engine/officeState.js';
import { bubbleLines, tooltipText, wrapBubble } from '../src/office/engine/sceneText.js';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.js';
import type { OfficeLayout } from '../src/office/types.js';
import { CharacterState, TileType } from '../src/office/types.js';
import type { CatMessageKind } from '../src/orchestratorEvents.js';
import { OrchestratorEvents } from '../src/orchestratorEvents.js';

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
    asset('TABLE', 'desks', 2, 2, { isDesk: true }),
    asset('SMALL_TABLE', 'desks', 1, 1, { isDesk: true }),
    asset('BED_CUSHION', 'beds', 1, 1),
  ];
  const sprites = Object.fromEntries(catalog.map((c) => [c.id, PIXEL]));
  assert.ok(buildDynamicCatalog({ catalog, sprites } as never));
});

/**
 * 16x12 floor. Desk chairs deskA..deskE at (1,1),(1,3),(1,5),(1,7),(1,9).
 * Meeting table (9..10, 4..5) with a sofa below it (9,6),(10,6) and wooden
 * chairs at (8,4) and (11,4). A small table with one chair at (13,1). A bed
 * at (14,10).
 */
function office(extra: Partial<OfficeLayout> = {}): OfficeState {
  const cols = 16;
  const rows = 12;
  const os = new OfficeState({
    version: 1,
    cols,
    rows,
    tiles: new Array<TileType>(cols * rows).fill(TileType.FLOOR_1),
    furniture: [
      ...['A', 'B', 'C', 'D', 'E'].map((s, i) => ({
        uid: `desk${s}`,
        type: 'WOODEN_CHAIR',
        col: 1,
        row: 1 + 2 * i,
      })),
      { uid: 'sofa', type: 'SOFA_FRONT', col: 9, row: 6 },
      { uid: 'table', type: 'TABLE', col: 9, row: 4 },
      { uid: 'm1', type: 'WOODEN_CHAIR', col: 8, row: 4 },
      { uid: 'm2', type: 'WOODEN_CHAIR', col: 11, row: 4 },
      { uid: 'small', type: 'SMALL_TABLE', col: 13, row: 1 },
      { uid: 'side', type: 'WOODEN_CHAIR', col: 12, row: 1 },
      { uid: 'bed', type: 'BED_CUSHION', col: 14, row: 10 },
    ],
    ...extra,
  });
  os.social.rng = () => 0.99; // no idle encounters
  os.life.activitySocial.rng = () => 0.99;
  return os;
}

/** An agent at its desk: idle (standing at its chair) or working (seated). */
function cat(os: OfficeState, id: number, seat: string, working = false) {
  os.addAgent(id, 0, 0, seat, true);
  os.setAgentActive(id, working);
  const ch = os.characters.get(id)!;
  ch.state = working ? CharacterState.TYPE : CharacterState.IDLE;
  ch.wanderTimer = 100;
  return ch;
}

function runFor(os: OfficeState, seconds: number) {
  for (let t = 0; t < seconds; t += 0.05) os.update(0.05);
}

/** Run until `done` holds (fails after `max` seconds). */
function runUntil(os: OfficeState, done: () => boolean, max = 60) {
  for (let t = 0; t < max; t += 0.05) {
    if (done()) return;
    os.update(0.05);
  }
  assert.fail('timed out');
}

function say(
  os: OfficeState,
  from: number,
  to: number,
  text: string,
  kind: CatMessageKind = 'delegate',
  summary?: string,
) {
  os.scenes.handle({ type: 'catMessage', from, to, kind, text, summary });
}

const at = (os: OfficeState, id: number) => {
  const ch = os.characters.get(id)!;
  return [ch.tileCol, ch.tileRow];
};
const near = (os: OfficeState, a: number, b: number) => {
  const [ac, ar] = at(os, a);
  const [bc, br] = at(os, b);
  return Math.max(Math.abs(ac - bc), Math.abs(ar - br)) <= 1;
};

// ── Bubble text ─────────────────────────────────────────────────

test('bubble text wraps to two lines and truncates with an ellipsis', () => {
  assert.deepEqual(wrapBubble('Fix the login bug'), ['Fix the login bug']);
  assert.deepEqual(wrapBubble('Please refactor the payment module today'), [
    'Please refactor the',
    'payment module today',
  ]);
  const long = wrapBubble('Please refactor the payment module and add tests for every edge case');
  assert.equal(long.length, 2);
  assert.ok(long[1].endsWith('…'));
  assert.ok(long.every((l) => l.length <= 20));
  const word = wrapBubble('supercalifragilisticexpialidocious-and-more-words-here');
  assert.equal(word.length, 2);
  assert.ok(word.every((l) => l.length <= 20));
  assert.ok(word[1].endsWith('…'));
  assert.deepEqual(wrapBubble('  spaced \n  out  '), ['spaced out']);
});

test('the summary wins over the text; the tooltip keeps the full summary', () => {
  const msg = { text: 'A very long message body that nobody reads', summary: 'Ship the fix' };
  assert.deepEqual(bubbleLines(msg), ['Ship the fix']);
  assert.equal(tooltipText(msg), 'Ship the fix');
  const full = 'Refactor auth: split the token refresh, add retries and log every failure';
  assert.equal(tooltipText({ text: full }), full);
  assert.equal(bubbleLines({ text: full }).join(' ').length <= 41, true);
});

test('the event bus delivers to every listener until it unsubscribes', () => {
  const bus = new OrchestratorEvents();
  const got: string[] = [];
  const off = bus.on((e) => got.push(e.type));
  bus.emit({
    type: 'flowStateChanged',
    taskId: 't',
    state: 'working',
    bossId: 1,
    participants: [],
  });
  off();
  bus.emit({ type: 'flowStateChanged', taskId: 't', state: 'done', bossId: 1, participants: [] });
  assert.deepEqual(got, ['flowStateChanged']);
});

// ── Work talks ──────────────────────────────────────────────────

test('the sender walks to an idle receiver, both bubbles show, then it returns to its desk', () => {
  const os = office();
  cat(os, 1, 'deskA', true);
  const b = cat(os, 2, 'deskE');
  b.tileCol = 7;
  b.tileRow = 8;
  b.x = 7 * 16 + 8;
  b.y = 8 * 16 + 8;
  say(os, 1, 2, 'Please build the login page', 'delegate');
  runFor(os, 0.05); // talks start on the next frame
  assert.ok(os.scenes.owns(1) && os.scenes.owns(2), 'both cats are in the scene');
  assert.equal(os.scenes.bubbles().length, 0, 'no bubble while walking');
  runFor(os, 8);
  assert.ok(near(os, 1, 2), 'the sender stands next to the receiver');
  assert.equal(os.scenes.talkPhase(1), 'speak');
  const [bubble] = os.scenes.bubbles();
  assert.equal(bubble.catId, 1);
  assert.equal(bubble.kind, 'delegate');
  assert.deepEqual(bubble.lines, ['Please build the', 'login page']);
  say(os, 2, 1, 'On it', 'reply');
  runUntil(os, () => os.scenes.talkPhase(1) === 'reply', 5);
  assert.deepEqual(
    os.scenes.bubbles().map((x) => [x.catId, x.kind]),
    [
      [1, 'delegate'],
      [2, 'reply'],
    ],
  );
  runFor(os, 15);
  assert.equal(os.scenes.talkPhase(1), null);
  assert.deepEqual(at(os, 1), [1, 1], 'back at its desk');
  assert.equal(os.characters.get(1)!.state, CharacterState.TYPE);
  assert.equal(os.scenes.owns(1), false, 'handed back to the FSM');
  assert.equal(os.scenes.owns(2), false);
});

test('a receiver working at its desk stays seated', () => {
  const os = office();
  cat(os, 1, 'deskA', true);
  const b = cat(os, 2, 'deskE', true);
  say(os, 1, 2, 'Status?', 'ask');
  runFor(os, 0.05);
  assert.equal(os.scenes.owns(2), false);
  runFor(os, 8);
  assert.equal(b.state, CharacterState.TYPE, 'still seated');
  assert.deepEqual(at(os, 2), [1, 9]);
  assert.ok(near(os, 1, 2), 'the sender came to the desk');
  assert.equal(os.scenes.bubbles()[0].catId, 1);
});

test('talks queue per cat in arrival order', () => {
  const os = office();
  cat(os, 1, 'deskA', true);
  cat(os, 2, 'deskC', true);
  cat(os, 3, 'deskE', true);
  say(os, 1, 2, 'first');
  say(os, 3, 2, 'second'); // waits: cat 2 is busy
  say(os, 2, 3, 'third'); // waits behind "second" (both cats are held)
  assert.equal(os.scenes.queued, 3);
  runFor(os, 0.05);
  assert.equal(os.scenes.queued, 2);
  assert.equal(os.scenes.talkPhase(3), null);
  runUntil(os, () => os.scenes.queued === 1); // first talk: walk, speak, wait, leave
  assert.equal(os.scenes.talkPhase(1), null, '"second" started after "first" ended');
  assert.notEqual(os.scenes.talkPhase(3), null);
  runFor(os, 60);
  assert.equal(os.scenes.queued, 0);
  assert.equal(os.scenes.talkPhase(2), null);
});

test('a message interrupts an idle activity and frees its reserved spot', () => {
  const os = office();
  cat(os, 1, 'deskA', true);
  const b = cat(os, 2, 'deskE');
  assert.ok(os.forceIdleActivity(2, 'bed'));
  runFor(os, 20);
  assert.equal(b.state, CharacterState.ACTIVITY);
  assert.equal(os.life.claims.spots.holderOf('14,10'), 2);
  say(os, 1, 2, 'Wake up, review my PR', 'ask');
  runFor(os, 0.1);
  assert.equal(b.activity, null, 'the nap stopped');
  assert.equal(os.life.claims.spots.holderOf('14,10'), undefined, 'the bed is free');
  runFor(os, 15);
  assert.ok(near(os, 1, 2));
});

test('a cat in a talk joins no idle social scene', () => {
  const os = office();
  const a = cat(os, 1, 'deskA');
  const b = cat(os, 2, 'deskB');
  say(os, 1, 2, 'hello');
  runFor(os, 0.05);
  assert.equal(os.social.trySocialEncounter(a, b, { kind: 'talk', radius: 20 }), null);
});

// ── Briefing meeting ────────────────────────────────────────────

function brief(os: OfficeState, state: 'briefing' | 'delegating', cats = [1, 2, 3, 4]) {
  os.scenes.handle({
    type: 'flowStateChanged',
    taskId: 'T1',
    state,
    bossId: 1,
    participants: cats,
  });
}

test('the meeting room: an Area named Meeting wins, else the biggest table with chairs', () => {
  const os = office();
  const plan = os.planMeeting()!;
  assert.deepEqual(
    plan.seats.map((s) => `${s.seatCol},${s.seatRow}`).sort(),
    ['10,6', '11,4', '8,4', '9,6'],
    'the 2x2 table, not the small one',
  );
  assert.ok(plan.head, 'the boss has a head spot');
  const cols = 16;
  const areaTiles = new Array<string | null>(cols * 12).fill(null);
  areaTiles[1 * cols + 12] = 'Meeting room';
  areaTiles[1 * cols + 11] = 'Meeting room';
  const os2 = office({ areas: [{ label: 'Meeting room', color: 'blue' }], areaTiles });
  const plan2 = os2.planMeeting()!;
  assert.deepEqual(
    plan2.seats.map((s) => s.uid),
    ['side'],
    'the chair inside the Meeting area',
  );
});

test('a briefing seats everyone at the table, the boss speaks at the head, then all go back', () => {
  const os = office();
  cat(os, 1, 'deskA', true);
  cat(os, 2, 'deskB', true);
  cat(os, 3, 'deskC');
  cat(os, 4, 'deskD');
  const napper = cat(os, 5, 'deskE');
  assert.ok(os.forceIdleActivity(5, 'sleep', '9,6'));
  runFor(os, 20);
  assert.equal(napper.activity?.id, 'sleep', 'a cat naps on the sofa seat');

  brief(os, 'briefing');
  const reserved = os.scenes.meetingSeats();
  assert.equal(reserved.length, 3, 'three chairs reserved for the participants');
  runFor(os, 0.1);
  for (const [key, id] of reserved) {
    const r = os.life.claims.spots.get(key);
    assert.equal(r?.holder, id);
    assert.equal(r?.tag, 'seat', 'a meeting chair is a seat: it outranks the nap');
  }
  assert.equal(napper.activity, null, 'the napping cat gave way');
  runFor(os, 20);
  const plan = os.planMeeting()!;
  for (const id of [2, 3, 4]) {
    const ch = os.characters.get(id)!;
    assert.equal(ch.state, CharacterState.TYPE, `cat ${id} sits`);
    assert.ok(plan.seats.some((s) => s.seatCol === ch.tileCol && s.seatRow === ch.tileRow));
  }
  assert.deepEqual(at(os, 1), [plan.head!.col, plan.head!.row], 'the boss stands at the head');
  assert.equal(os.characters.get(1)!.state, CharacterState.IDLE);
  const [b] = os.scenes.bubbles();
  assert.equal(b.catId, 1);
  assert.equal(b.kind, 'brief');

  say(os, 1, 3, 'You take the API', 'brief', 'API work for you');
  assert.deepEqual(
    os.scenes.bubbles()[0].lines,
    ['API work for you'],
    'the brief updates the bubble',
  );
  say(os, 3, 1, 'Which endpoints?', 'ask');
  runFor(os, 0.1);
  assert.equal(os.scenes.talkPhase(3), 'speak', 'a talk inside the meeting plays in place');
  assert.deepEqual(at(os, 3).length, 2);

  brief(os, 'delegating');
  assert.deepEqual(os.scenes.meetingSeats(), [], 'chairs released');
  runFor(os, 40);
  for (const [id, seat] of [
    [1, [1, 1]],
    [2, [1, 3]],
    [3, [1, 5]],
    [4, [1, 7]],
  ] as const) {
    assert.equal(os.scenes.owns(id), false, `cat ${id} is free again`);
    if (os.characters.get(id)!.isActive)
      assert.deepEqual(at(os, id), seat, `cat ${id} at its desk`);
  }
  assert.equal(os.life.claims.spots.holders('seat').size, 5, 'only the desk seats stay reserved');
});

test('messages for a cat in the meeting wait until the meeting ends', () => {
  const os = office();
  cat(os, 1, 'deskA', true);
  cat(os, 2, 'deskB', true);
  cat(os, 5, 'deskE', true);
  brief(os, 'briefing', [1, 2]);
  say(os, 5, 2, 'Lunch?', 'ask');
  runFor(os, 5);
  assert.equal(os.scenes.queued, 1, 'cat 2 is in the meeting');
  brief(os, 'delegating', [1, 2]);
  runFor(os, 0.1);
  assert.equal(os.scenes.queued, 0, 'the talk starts after the meeting');
});
