/**
 * Cat personalities: a preset scales the idle tuning of its cat, a pair of
 * cats takes the stronger trait, and a cat without one behaves as before.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import type { CatPersonality } from '../../core/src/messages.js';
import { SOCIAL_FIGHT_CHANCE } from '../src/constants.js';
import { rollKind } from '../src/office/engine/catSocial.js';
import { chooseIdleActivity, IDLE_ACTIVITIES } from '../src/office/engine/idleActivities.js';
import { activityMul, pairMul, personalityMul } from '../src/office/engine/personality.js';
import { mulberry32 } from '../src/office/engine/socialMoves.js';
import type { ActivitySpot } from '../src/office/types.js';
import { Direction } from '../src/office/types.js';

// In-place activities (wander, groom, yawn, stretch, tailChase, loaf) plus a sofa nap on one seat.
const IN_PLACE = IDLE_ACTIVITIES.filter(
  (d) => d.id === 'sleep' || (!d.spots && !d.work && d.weight > 0),
);
const SOFA: ActivitySpot = {
  key: '2,2',
  col: 2,
  row: 2,
  facing: Direction.DOWN,
  onFurniture: true,
  offsetX: 0,
  offsetY: 0,
};
const SPOTS = new Map([['sleep', { spots: [SOFA], fallback: [] }]]);

function share(id: string, personality?: CatPersonality): number {
  const rng = mulberry32(11);
  const n = 20000;
  let hits = 0;
  for (let i = 0; i < n; i++) {
    const pick = chooseIdleActivity(null, SPOTS, new Set(), rng, IN_PLACE, personality);
    if (pick?.def.id === id) hits++;
  }
  return hits / n;
}

test('a sleepy cat sleeps far more often, a cat without one keeps the base weights', () => {
  assert.ok(share('sleep', 'sleepy') > share('sleep') * 1.6, 'sleepy naps on the sofa more');
  const base = share('loaf');
  const sleepy = share('loaf', 'sleepy');
  assert.ok(sleepy > base * 1.6, `sleepy ${sleepy} vs base ${base}`);
  assert.ok(share('wander', 'zoomie') > share('wander') * 1.5, 'zoomie wanders more');
  // No personality: the weights are the defs' own.
  const weights = IN_PLACE.map((d) => d.weight);
  const total = weights.reduce((a, b) => a + b, 0);
  const loaf = IN_PLACE.find((d) => d.id === 'loaf')!.weight;
  assert.ok(Math.abs(base - loaf / total) < 0.015, `base share ${base}`);
});

test('a scrappy pair fights about five times as often', () => {
  const rate = (mul: number) => {
    const rng = mulberry32(42);
    const n = 30000;
    let fights = 0;
    for (let i = 0; i < n; i++) if (rollKind(rng, false, mul) === 'fight') fights++;
    return fights / n;
  };
  const scrappy = rate(pairMul('scrappy', undefined, 'fight'));
  assert.ok(Math.abs(rate(1) - SOCIAL_FIGHT_CHANCE) < 0.006);
  assert.ok(Math.abs(scrappy - SOCIAL_FIGHT_CHANCE * 5) < 0.015, `scrappy rate ${scrappy}`);
});

test('a pair takes the stronger trait; no personality is 1 everywhere', () => {
  assert.equal(pairMul('scrappy', 'social', 'fight'), 5);
  assert.equal(pairMul('social', undefined, 'fight'), 0.3);
  assert.equal(pairMul(undefined, undefined, 'encounter'), 1);
  assert.equal(personalityMul(undefined, 'bowel'), 1);
  assert.equal(personalityMul('pooper', 'bowel'), 3);
  assert.equal(activityMul('playful', 'yarn'), 3);
  assert.equal(activityMul('sleepy', 'catBed'), 3);
  assert.equal(activityMul('pooper', 'litterHood'), 6);
  assert.equal(activityMul('pooper', 'coffee'), 1);
});
