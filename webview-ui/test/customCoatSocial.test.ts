/**
 * A resident cat with a custom coat keeps that coat in its idle social poses
 * (talk, angry), in the fight cloud paws and in the house peek, instead of
 * the colours of its breed palette.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import { toHex } from '../src/cats/catArt.js';
import { furColorOf, socialSpriteFor } from '../src/office/engine/socialRender.js';
import { appearanceSprites } from '../src/office/sprites/appearanceSprites.js';
import { getFurColor } from '../src/office/sprites/socialSprites.js';
import type { Character } from '../src/office/types.js';
import { Direction } from '../src/office/types.js';

const BLUE = toHex([47, 127, 255]);
const coat = { breed: 'tux', colors: { fur: BLUE } };
const pixels = (s: string[][]) => new Set(s.flat().filter(Boolean));

function cat(pose: 'talk' | 'angry' | null, custom = true) {
  return {
    palette: 4, // the Tux sheet
    hueShift: 0,
    dir: Direction.RIGHT,
    customSprites: custom ? appearanceSprites(coat) : undefined,
    social: { pose, frame: 0, bubble: null, anger: null, cloud: null },
  } as unknown as Character;
}

test('a custom coat gets talk and angry frames in its own colours', () => {
  const sprites = appearanceSprites(coat)!;
  assert.ok(sprites.social, 'social poses are generated');
  for (const pose of ['talk', 'angry'] as const)
    for (const dir of [Direction.DOWN, Direction.UP, Direction.RIGHT, Direction.LEFT])
      assert.ok(sprites.social[pose][dir].length > 0, `${pose} ${dir}`);
  const talk = socialSpriteFor(cat('talk'), [['']])!;
  assert.equal(talk, sprites.social.talk[Direction.RIGHT][0]);
  assert.ok(pixels(talk).has(BLUE), 'the talk frame is painted with the custom fur');
});

test('a plain breed keeps the breed art', () => {
  const base = [['']];
  const s = socialSpriteFor(cat('angry', false), base);
  assert.notEqual(s, base);
  assert.ok(!pixels(s!).has(BLUE));
});

test('fight cloud and house peek use the custom fur', () => {
  assert.equal(furColorOf(cat(null)), BLUE);
  assert.equal(furColorOf(cat(null, false)), getFurColor(4, 0));
});
