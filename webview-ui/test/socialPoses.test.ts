/**
 * Social poses: a talk opens with a nose boop (and maybe a head rub), the
 * listener flicks its tail, and two cats about to fight square off side-on,
 * head to tail; the standoff ends in the dust cloud or with one backing down.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import { renderAppearance } from '../src/cats/catArt.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import { spritesFromSheet } from '../src/office/sprites/spriteData.js';
import type { Character, OfficeLayout } from '../src/office/types.js';
import { CharacterState, Direction, TileType } from '../src/office/types.js';

function pair(): { os: OfficeState; a: Character; b: Character } {
  const cols = 8;
  const rows = 5;
  const layout: OfficeLayout = {
    version: 1,
    cols,
    rows,
    tiles: new Array<TileType>(cols * rows).fill(TileType.FLOOR_1),
    furniture: [],
  };
  const os = new OfficeState(layout);
  const sprites = spritesFromSheet(renderAppearance({ breed: 'shadow' }));
  const [a, b] = [1, 2].map((id) => {
    os.addAgent(id, 0, 0, undefined, true);
    os.setAgentActive(id, false);
    const ch = os.characters.get(id)!;
    Object.assign(ch, { state: CharacterState.IDLE, tileCol: 2 + id, tileRow: 2, wanderTimer: 99 });
    ch.x = ch.tileCol * 16 + 8;
    ch.y = 2 * 16 + 8;
    ch.customSprites = sprites;
    return ch;
  });
  return { os, a, b };
}

/** Poses either cat shows over `sec` seconds, as "<id>:<pose>". */
function posesOf(os: OfficeState, cats: Character[], sec: number): Set<string> {
  const seen = new Set<string>();
  for (let t = 0; t < sec; t += 0.05) {
    os.update(0.05);
    for (const ch of cats) if (ch.social?.pose) seen.add(`${ch.id}:${ch.social.pose}`);
  }
  return seen;
}

test('a talk starts with a nose boop, and the listener flicks its tail', () => {
  const { os, a, b } = pair();
  assert.equal(os.social.trySocialEncounter(a, b, { kind: 'talk' }), 'talk');
  const seen = posesOf(os, [a, b], 6);
  const any = (p: string) => seen.has(`1:${p}`) || seen.has(`2:${p}`);
  assert.ok(seen.has('1:boop') && seen.has('2:boop'), [...seen].join(','));
  assert.ok(any('flick'), 'a listener flicks its tail');
  assert.ok(any('talk'), 'then they talk');
});

/** Run until `done()` or `sec` seconds pass; returns the poses seen, as in posesOf. */
function until(os: OfficeState, cats: Character[], sec: number, done: () => boolean): Set<string> {
  const seen = new Set<string>();
  for (let t = 0; t < sec && !done(); t += 0.05) {
    os.update(0.05);
    for (const ch of cats) if (ch.social?.pose) seen.add(`${ch.id}:${ch.social.pose}`);
  }
  return seen;
}

test('before a fight, the cats walk head to tail and puff up side-on', () => {
  const { os, a, b } = pair();
  assert.equal(os.social.trySocialEncounter(a, b, { kind: 'fight' }), 'fight');
  until(os, [a, b], 8, () => os.social.sceneInfo(1)?.phase === 'standoff');
  assert.equal(os.social.sceneInfo(1)?.phase, 'standoff');
  assert.equal(Math.abs(a.tileRow - b.tileRow), 1, 'adjacent rows');
  assert.ok(Math.abs(a.tileCol - b.tileCol) <= 1, 'bodies overlap');
  const [top, bottom] = a.tileRow < b.tileRow ? [a, b] : [b, a];
  assert.equal(top.dir, Direction.LEFT);
  assert.equal(bottom.dir, Direction.RIGHT);
  // Intro, then the sway in anti-phase.
  const frames = new Set<string>();
  for (let t = 0; t < 2.5; t += 0.05) {
    os.update(0.05);
    assert.equal(a.social?.pose, 'standoff');
    frames.add(`${a.social?.frame}/${b.social?.frame}`);
  }
  assert.ok(frames.has('2/2'), 'both hold the peak');
  assert.ok(frames.has('3/4') && frames.has('4/3'), [...frames].join(' '));
});

test('a standoff with a low roll ends in the dust cloud', () => {
  const { os, a, b } = pair();
  os.social.rng = () => 0.01;
  os.social.trySocialEncounter(a, b, { kind: 'fight' });
  const seen = until(os, [a, b], 15, () => a.social?.pose === 'hidden');
  assert.ok(seen.has('1:standoff') && seen.has('2:standoff'));
  assert.equal(a.social?.pose, 'hidden');
  assert.ok(a.social?.cloud, 'the cloud rides on cat a');
});

test('a standoff with a high roll ends with the loser walking off, no cloud', () => {
  const { os, a, b } = pair();
  os.social.rng = () => 0.99;
  // A spot contest names the loser; without it the roll would pick b (rng 0.99).
  os.social.trySocialEncounter(a, b, { kind: 'fight', loser: a.id });
  until(os, [a, b], 15, () => os.social.sceneInfo(1)?.phase === 'backDown');
  const from = { col: a.tileCol, row: a.tileRow };
  const bFrom = { col: b.tileCol, row: b.tileRow };
  const seen = until(os, [a, b], 10, () => !os.social.isInScene(1));
  assert.equal(os.social.isInScene(1), false, 'the scene ended');
  assert.ok(![...seen].some((p) => p.endsWith(':hidden')), 'no dust cloud');
  until(os, [a, b], 5, () => a.path.length === 0 && a.state !== CharacterState.WALK);
  const walked = Math.max(Math.abs(a.tileCol - from.col), Math.abs(a.tileRow - from.row));
  assert.ok(walked >= 2, `the loser walked ${walked} tiles away`);
  assert.deepEqual({ col: b.tileCol, row: b.tileRow }, bFrom, 'the winner held its ground');
});
