/**
 * Social poses: a talk opens with a nose boop (and maybe a head rub), the
 * listener flicks its tail, and two cats about to fight side by side arch
 * their backs and hiss.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import { renderAppearance } from '../src/cats/catArt.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import { spritesFromSheet } from '../src/office/sprites/spriteData.js';
import type { Character, OfficeLayout } from '../src/office/types.js';
import { CharacterState, TileType } from '../src/office/types.js';

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

test('side by side, cats about to fight arch their backs and hiss', () => {
  const { os, a, b } = pair();
  assert.equal(os.social.trySocialEncounter(a, b, { kind: 'fight' }), 'fight');
  const seen = posesOf(os, [a, b], 2);
  assert.ok(seen.has('1:hiss') && seen.has('2:hiss'), [...seen].join(','));
});
