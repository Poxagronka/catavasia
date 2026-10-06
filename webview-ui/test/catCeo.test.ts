/**
 * The Cat CEO in the webview (docs/catavasia/cat-ceo-judge.md §9, §10): the
 * review walk from `reviewFinished` (lowest score first, at most 4 cats, the
 * anomalies on hover), its desk in a "head" Area, the task card badge, and
 * the client store of the settings and the prompt history.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { beforeAll, test } from 'vitest';

import type { ClientMessage, ServerMessage } from '../../core/src/messages.js';
import { CatOfficeFeed, type FeedWorld } from '../src/catOfficeFeed.js';
import { createCatCeoStore } from '../src/cats/catCeoStore.js';
import { reviewBadge } from '../src/components/taskBoard/taskFormat.js';
import { OfficeState, type ResidentCat } from '../src/office/engine/officeState.js';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.js';
import { CharacterState, TileType } from '../src/office/types.js';
import type { CatMessageEvent, OrchestratorEvent } from '../src/orchestratorEvents.js';
import { OrchestratorEvents } from '../src/orchestratorEvents.js';

beforeAll(() => {
  const chair = {
    id: 'WOODEN_CHAIR',
    name: 'chair',
    label: 'chair',
    category: 'chairs',
    file: 'c.png',
    width: 16,
    height: 16,
    footprintW: 1,
    footprintH: 1,
    isDesk: false,
    canPlaceOnWalls: false,
  };
  assert.ok(buildDynamicCatalog({ catalog: [chair], sprites: { WOODEN_CHAIR: [['']] } } as never));
});

const REVIEW: ServerMessage = {
  type: 'reviewFinished',
  taskId: 't1',
  reviewId: 'rv-1',
  verdict: 'concerns',
  summary: 'murka skipped the tests',
  scores: [
    { catId: 'boss', assignmentId: 'root', score: 82, bubble: 'clean split' },
    {
      catId: 'murka',
      assignmentId: 'a1',
      score: 58,
      bubble: 'forgot the tests',
      anomalies: ['no_tests_run (medium): no npm test'],
    },
    { catId: 'murka', assignmentId: 'a3', score: 75, bubble: 'better' },
    { catId: 'pushok', assignmentId: 'a2', score: 90, bubble: 'neat' },
    { catId: 'a', assignmentId: 'a4', score: 91, bubble: 'x' },
    { catId: 'b', assignmentId: 'a5', score: 92, bubble: 'y' },
  ],
  edits: [{ catId: 'murka', sha: 'abc', subject: 'cat-ceo(murka): add R4', items: ['R4'] }],
  rejectedEdits: [],
};

function feed(withCeo = true) {
  const residents: ResidentCat[][] = [];
  const world: FeedWorld = { setResidentCats: (l) => residents.push(l), setQueuedCats: () => {} };
  const bus = new OrchestratorEvents();
  const events: OrchestratorEvent[] = [];
  bus.on((e) => events.push(e));
  const f = new CatOfficeFeed(() => world, bus);
  const ids = ['boss', 'murka', 'pushok', 'a', 'b', ...(withCeo ? ['cat-ceo'] : [])];
  f.handle({
    type: 'catCharacters',
    characters: ids.map((catId, i) => ({
      catId,
      id: 11 + i,
      name: catId,
      appearance: {},
      working: false,
    })),
  });
  return { f, events, residents };
}

test('feed: a review walks to the cats, lowest score first, at most 4, with edit notes and anomalies', () => {
  const { f, events, residents } = feed();
  assert.equal(residents[0].find((r) => r.id === 16)?.ceo, true);
  f.handle(REVIEW);
  const talks = events.filter((e): e is CatMessageEvent => e.type === 'catMessage');
  assert.deepEqual(
    talks.map((t) => [t.from, t.to, t.kind, t.text]),
    [
      [16, 12, 'review', '58 · forgot the tests · new rule R4'],
      [16, 11, 'review', '82 · clean split'],
      [16, 13, 'review', '90 · neat'],
      [16, 14, 'review', '91 · x'],
    ],
  );
  assert.equal(
    talks[0].tooltip,
    '58 · forgot the tests · new rule R4 | no_tests_run (medium): no npm test',
  );
});

test('feed: a tidy with changes walks to the cat; one without changes does not', () => {
  const { f, events } = feed();
  f.handle({
    type: 'promptTidy',
    catId: 'murka',
    state: 'done',
    text: 'murka: nothing',
    changed: 0,
  });
  f.handle({ type: 'promptTidy', catId: 'murka', state: 'queued', text: 'queued' });
  f.handle({
    type: 'promptTidy',
    catId: 'murka',
    state: 'done',
    text: 'murka: tidied 3 items',
    sha: 'abc',
    changed: 3,
  });
  const talks = events.filter((e): e is CatMessageEvent => e.type === 'catMessage');
  assert.deepEqual(
    talks.map((t) => [t.from, t.to, t.kind, t.text, t.tooltip]),
    [[16, 12, 'review', 'tidied 3 items', 'murka: tidied 3 items']],
  );
});

test('feed: no Cat CEO character, no walk', () => {
  const { f, events } = feed(false);
  f.handle(REVIEW);
  assert.equal(events.length, 0);
});

/** 12x6 floor, desk chairs at (1,1),(1,3); a chair at (10,1) in the "Head office" Area. */
function office(): OfficeState {
  const cols = 12;
  const rows = 6;
  const areaTiles = new Array<string | null>(cols * rows).fill(null);
  areaTiles[1 * cols + 10] = 'Head office';
  const os = new OfficeState({
    version: 1,
    cols,
    rows,
    tiles: new Array<TileType>(cols * rows).fill(TileType.FLOOR_1),
    furniture: [
      { uid: 'deskA', type: 'WOODEN_CHAIR', col: 1, row: 1 },
      { uid: 'deskB', type: 'WOODEN_CHAIR', col: 1, row: 3 },
      { uid: 'head', type: 'WOODEN_CHAIR', col: 10, row: 1 },
    ],
    areas: [{ label: 'Head office', color: 'gold' }],
    areaTiles,
  } as never);
  os.social.rng = () => 0.99;
  os.life.activitySocial.rng = () => 0.99;
  return os;
}

test('the Cat CEO takes the desk in the head Area, walks to the reviewed cat and says its score', () => {
  const os = office();
  os.addAgent(1, 0, 0, 'deskA', true);
  os.addAgent(9, 0, 0, 'deskB', true);
  for (const id of [1, 9]) {
    const ch = os.characters.get(id)!;
    ch.state = CharacterState.IDLE;
    ch.wanderTimer = 100;
  }
  os.setResidentCats([
    { id: 1, name: 'Luna', appearance: {}, working: false },
    { id: 9, name: 'Cat CEO', appearance: {}, working: false, ceo: true },
  ]);
  assert.equal(os.characters.get(9)!.seatId, 'head');
  os.scenes.handle({
    type: 'catMessage',
    from: 9,
    to: 1,
    kind: 'review',
    text: '58 · forgot the tests',
    tooltip: '58 · forgot the tests | no_tests_run (medium): no npm test',
  });
  let bubble;
  for (let t = 0; t < 40 && !bubble; t += 0.05) {
    os.update(0.05);
    bubble = os.scenes.bubbles().find((b) => b.kind === 'review');
  }
  assert.ok(bubble, 'the review bubble shows');
  assert.deepEqual(bubble.lines, ['58 · forgot the', 'tests']);
  assert.equal(bubble.tooltip, '58 · forgot the tests | no_tests_run (medium): no npm test');
  const ceo = os.characters.get(9)!;
  assert.ok(Math.abs(ceo.tileCol - 1) + Math.abs(ceo.tileRow - 1) <= 2, 'it stands by the cat');
  // No reply comes: the talk ends after the line, and the Cat CEO walks back to its desk.
  let home = false;
  for (let t = 0; t < 30 && !home; t += 0.05) {
    os.update(0.05);
    home = os.scenes.talkPhase(9) === null && ceo.tileCol === 10 && ceo.tileRow === 1;
  }
  assert.ok(home, 'back at the head desk');
});

test('task card badge: queued, reviewing, scores with verdict, failed', () => {
  assert.equal(reviewBadge(undefined), null);
  assert.equal(reviewBadge({ state: 'pending', reviewId: 'r' })?.text, 'CEO: queued');
  assert.deepEqual(
    reviewBadge({
      state: 'reviewed',
      reviewId: 'r',
      verdict: 'concerns',
      summary: 'tests missing',
      minScore: 58,
      maxScore: 90,
      costUsd: 0.214,
    }),
    { text: 'CEO: 58–90 concerns', title: 'tests missing ($0.21)' },
  );
  assert.equal(reviewBadge({ state: 'failed', reviewId: 'r', error: 'boom' })?.title, 'boom');
});

test('client store: settings, history and diff from the server; actions send the messages', () => {
  const sent: ClientMessage[] = [];
  let handler: (m: ServerMessage) => void = () => {};
  const store = createCatCeoStore({
    send: (m) => sent.push(m),
    onMessage: (h) => {
      handler = h;
      return () => {};
    },
  });
  assert.equal(store.getSnapshot().settings, null);
  handler({
    type: 'catCeoSettings',
    enabled: true,
    name: 'Cat CEO',
    appearance: {},
    model: 'opus',
    effort: 'high',
    maxEditsPerCatPerDay: 2,
    tidyUserItems: false,
    systemPrompt: 'judge',
  });
  assert.equal(store.getSnapshot().settings?.model, 'opus');
  handler({
    type: 'promptHistory',
    catId: 'murka',
    entries: [{ sha: 'abc', at: 1, author: 'cat-ceo', subject: 'cat-ceo(murka): add R4' }],
  });
  handler({ type: 'promptDiff', catId: 'murka', sha: 'abc', diff: '+- [R4] x' });
  assert.equal(store.getSnapshot().history.murka[0].author, 'cat-ceo');
  assert.equal(store.getSnapshot().diffs['murka:abc'], '+- [R4] x');
  store.setSettings({ enabled: false });
  assert.equal(store.getSnapshot().settings?.enabled, true, 'the server decides');
  store.revert('murka', 'abc');
  store.removeItem('murka', 'R4');
  store.saveItem('murka', 'Lessons', 'A fact.');
  // A review that edited an open history refreshes it.
  handler(REVIEW);
  assert.deepEqual(sent, [
    { type: 'setCatCeoSettings', enabled: false },
    { type: 'revertPromptEdit', catId: 'murka', sha: 'abc' },
    { type: 'removePromptItem', catId: 'murka', itemId: 'R4' },
    { type: 'savePromptItem', catId: 'murka', section: 'Lessons', text: 'A fact.' },
    { type: 'getPromptHistory', catId: 'murka' },
  ]);
});

test('client store: Tidy now, the tidy state, and the last tidy of a loaded history', () => {
  const sent: ClientMessage[] = [];
  let handler: (m: ServerMessage) => void = () => {};
  const store = createCatCeoStore({
    send: (m) => sent.push(m),
    onMessage: (h) => {
      handler = h;
      return () => {};
    },
  });
  store.tidyNow('murka');
  handler({ type: 'promptTidy', catId: 'murka', state: 'queued', text: 'queued' });
  assert.equal(store.getSnapshot().tidy.murka.state, 'queued');
  const row = {
    op: 'remove' as const,
    applied: false,
    section: 'Rules' as const,
    before: [{ id: 'R1', text: 'mine' }],
    reason: 'stale',
  };
  handler({
    type: 'promptHistory',
    catId: 'murka',
    entries: [],
    lastTidy: { at: 1, trigger: 'manual', summary: 's', rows: [row] },
  });
  assert.equal(store.getSnapshot().lastTidy.murka?.rows[0].applied, false);
  // A finished tidy refreshes the open history.
  handler({ type: 'promptTidy', catId: 'murka', state: 'done', text: 'done', changed: 1 });
  assert.deepEqual(sent, [
    { type: 'tidyPrompt', catId: 'murka' },
    { type: 'getPromptHistory', catId: 'murka' },
  ]);
});
