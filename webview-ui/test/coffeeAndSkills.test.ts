/**
 * The coffee corner and skill reading in the bundled default office
 * (revision 5): the brew -> sip -> return chain with its reservations and
 * machine frames, the turn queue at the coffee machine, and a cat reading a
 * skill at the bookshelf (min duration, the shelf gap, the desk fallback).
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeAll, beforeEach, test } from 'vitest';

import { buildFurnitureCatalog } from '../../core/src/assets/build.ts';
import { getCharacterSprite } from '../src/office/engine/characters.js';
import { CUP_OUT_FRAME } from '../src/office/engine/coffeeActivities.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import { SKILL_READ_MIN_SEC } from '../src/office/engine/skillReading.js';
import { mulberry32 } from '../src/office/engine/socialMoves.js';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.js';
import { spritesFromSheet } from '../src/office/sprites/spriteData.js';
import type { Character, OfficeLayout, SpriteData } from '../src/office/types.js';
import { CharacterState } from '../src/office/types.js';

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');

/** Every catalog sprite is a labelled stub: [[id]], shelves full size. */
beforeAll(() => {
  const catalog = buildFurnitureCatalog(ASSETS);
  const sprites: Record<string, SpriteData> = {};
  for (const c of catalog) {
    sprites[c.id] = c.id.includes('BOOKSHELF')
      ? Array.from({ length: c.height }, () => new Array<string>(c.width).fill('book'))
      : [[c.id]];
  }
  assert.ok(buildDynamicCatalog({ catalog, sprites } as never));
});

// Idle picks and durations roll Math.random: seed it so every run walks the same way.
const realRandom = Math.random;
beforeEach(() => {
  Math.random = mulberry32(7);
});
afterEach(() => {
  Math.random = realRandom;
});

function office(rev = 5): OfficeState {
  const file = path.join(ASSETS, `default-layout-${rev}.json`);
  return new OfficeState(JSON.parse(fs.readFileSync(file, 'utf-8')) as OfficeLayout);
}

/** A cat with one recognisable sprite per frame: [[`frame:<dir>:<i>`]]. */
function cat(os: OfficeState, id: number, active = false): Character {
  os.addAgent(id, 0, 0, undefined, true);
  os.setAgentActive(id, active);
  const ch = os.characters.get(id)!;
  const row = (dir: string) =>
    Array.from({ length: 120 }, (_, i) => [[`frame:${dir}:${i}`]]) as SpriteData[];
  ch.customSprites = spritesFromSheet({ down: row('down'), up: row('up'), right: row('right') });
  if (!active) ch.state = CharacterState.IDLE;
  return ch;
}

function runUntil(os: OfficeState, done: () => boolean, max = 60, each?: () => void) {
  for (let t = 0; t < max; t += 0.05) {
    if (done()) return t;
    os.update(0.05);
    each?.();
  }
  assert.fail('condition never held');
}

const machineSprite = (os: OfficeState, uid: string) =>
  os.getFurnitureForRender().find((f) => f.uid === uid)!.sprite[0][0];

test('revision 5 has a coffee station on the main-room counter, and the cats can reach it', () => {
  const os = office();
  const types = os.layout.furniture.map((f) => f.type);
  for (const t of ['ESPRESSO_MACHINE', 'POUR_OVER', 'DRIP_COFFEE_MAKER'])
    assert.ok(types.includes(t), t);
  const brew = os.activitySpots.get('brew')!.spots;
  const keys = brew.map((s) => s.key);
  assert.ok(keys.includes('2,19'), 'beside the espresso machine');
  assert.ok(keys.includes('2,20'), 'beside the pour-over');
  assert.ok(os.queueTiles(1)[0], 'the turn queue has a line');
  assert.deepEqual(
    os.queueTiles(1)[0],
    { col: brew[0].col, row: brew[0].row },
    'it starts at a machine',
  );
});

test('making coffee: brew at the machine, carry the cup to a seat and sip, bring it back', () => {
  const os = office();
  const ch = cat(os, 1);
  const other = cat(os, 2, true); // works at its desk: no idle picks of its own
  assert.ok(os.forceIdleActivity(1, 'brew', '2,19'));
  // The machine plays its brewing frames while the cat waits.
  const frames = new Set<string>();
  runUntil(
    os,
    () => ch.activity?.id === 'coffeeSip',
    40,
    () => frames.add(machineSprite(os, 'f-coffee-espresso')),
  );
  for (let f = 1; f <= 5; f++) assert.ok(frames.has(`ESPRESSO_MACHINE_${f}`), `frame ${f}`);
  assert.equal(ch.activity?.cupFrom, 'f-coffee-espresso');
  // It walks with the mug: the carry walk poses, not the plain walk cycle.
  runUntil(os, () => ch.state === CharacterState.WALK, 5);
  assert.ok(getCharacterSprite(ch, ch.customSprites!)[0][0].startsWith('frame:'));
  // The seat is reserved for it, and the machine shows no cup meanwhile.
  const sipKey = ch.activity!.spot!.key;
  assert.equal(os.life.claims.spots.holderOf(sipKey), 1, 'the sip spot is reserved for it');
  assert.ok(os.life.claims.spots.heldByOthers(other.id).has(sipKey));
  runUntil(os, () => ch.state === CharacterState.ACTIVITY && ch.activity?.id === 'coffeeSip');
  assert.equal(machineSprite(os, 'f-coffee-espresso'), `ESPRESSO_MACHINE_${CUP_OUT_FRAME}`);
  // Then the cup goes back to the same machine.
  runUntil(os, () => ch.activity?.id === 'coffeeReturn', 40);
  assert.equal(ch.activity?.spot?.itemUid, 'f-coffee-espresso');
  runUntil(os, () => ch.lastActivityId === 'coffeeReturn', 40);
  assert.equal(machineSprite(os, 'f-coffee-espresso'), 'ESPRESSO_MACHINE', 'the cup is back');
});

test('a cat reads a skill at the bookshelf: the book comes out, the scene plays out, back to work', () => {
  const os = office();
  const ch = cat(os, 1, true);
  runUntil(os, () => ch.state === CharacterState.TYPE, 30);
  const seat = { col: ch.tileCol, row: ch.tileRow };
  // The webview does this on every tool start: the tool, then active.
  os.setAgentTool(1, 'Skill');
  os.setAgentActive(1, true);
  assert.equal(ch.activity?.id, 'skillRead');
  const shelfUid = ch.activity!.spot!.itemUid!;
  const plain = os.furniture.find((f) => f.uid === shelfUid)!.sprite;
  // The agent moves on to other tools at once: the scene still plays out.
  os.setAgentTool(1, 'Read');
  os.setAgentActive(1, true);
  runUntil(os, () => ch.state === CharacterState.ACTIVITY, 30);
  let gap = false;
  const t = runUntil(
    os,
    () => ch.lastActivityId === 'skillRead',
    30,
    () => {
      const now = os.getFurnitureForRender().find((f) => f.uid === shelfUid)!.sprite;
      if (now !== plain) gap = true;
    },
  );
  assert.ok(gap, 'the shelf shows the gap while the book is out');
  assert.ok(t >= SKILL_READ_MIN_SEC, `reads at least ${SKILL_READ_MIN_SEC} s (${t.toFixed(1)})`);
  runUntil(os, () => ch.state === CharacterState.TYPE, 30);
  assert.deepEqual({ col: ch.tileCol, row: ch.tileRow }, seat, 'back at its desk');
});

test('with no bookshelf in reach the cat reads the skill at its desk', () => {
  const layout = JSON.parse(
    fs.readFileSync(path.join(ASSETS, 'default-layout-5.json'), 'utf-8'),
  ) as OfficeLayout;
  layout.furniture = layout.furniture.filter((f) => !f.type.includes('BOOKSHELF'));
  const os = new OfficeState(layout);
  const ch = cat(os, 1, true);
  runUntil(os, () => ch.state === CharacterState.TYPE, 30);
  os.setAgentTool(1, 'Skill');
  os.setAgentActive(1, true);
  assert.equal(ch.activity, null);
  assert.ok((ch.deskReadSec ?? 0) > 0);
  assert.equal(ch.state, CharacterState.TYPE);
  assert.deepEqual(getCharacterSprite(ch, ch.customSprites!), ch.customSprites!.reading[ch.dir][0]);
});

test('a turn that ends while the cat walks to the shelf does not cancel the reading', () => {
  const os = office();
  const ch = cat(os, 1, true);
  runUntil(os, () => ch.state === CharacterState.TYPE, 30);
  os.setAgentTool(1, 'Skill');
  os.setAgentActive(1, true);
  os.update(0.2);
  assert.equal(ch.state, CharacterState.WALK);
  os.setAgentActive(1, false);
  runUntil(os, () => ch.state === CharacterState.ACTIVITY && ch.activity?.id === 'skillRead', 30);
  runUntil(os, () => ch.lastActivityId === 'skillRead', 30);
});
