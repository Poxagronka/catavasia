/**
 * The spot reservation service: reserve, exclusivity, contests (seeded rng:
 * fight vs re-pick), release paths, seat sync.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import { SpotReservations } from '../src/office/engine/spotReservations.js';

/** An rng that returns the given rolls in turn. */
function rolls(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

test('a claim reserves every key for its holder; nobody else may take them', () => {
  const s = new SpotReservations({ rng: rolls(0.9) });
  assert.deepEqual(s.claim(['1,1', '2,1'], 7), { ok: true });
  assert.equal(s.holderOf('1,1'), 7);
  assert.equal(s.holderOf('2,1'), 7);
  s.arrive(7);
  const res = s.claim(['2,1'], 8);
  assert.deepEqual(res, { ok: false, outcome: 'taken', rival: 7 });
  assert.equal(s.holderOf('2,1'), 7, 'a failed claim reserves nothing');
  assert.ok(s.blockedFor(8).has('1,1'));
  assert.ok(!s.blockedFor(7).has('1,1'), 'own keys are never blocked');
});

test('contest: a fresh claim rolls a fight or a re-pick; an old one is just taken', () => {
  const fight = new SpotReservations({ rng: rolls(0.1, 0.2), fightChance: 0.35, windowSec: 1.5 });
  fight.claim(['3,3'], 1);
  assert.ok(fight.isContestable('3,3', 2), 'fresh and not reached yet');
  assert.ok(!fight.blockedFor(2).has('3,3'), 'a contestable spot stays pickable');
  assert.deepEqual(fight.claim(['3,3'], 2), { ok: false, outcome: 'fight', rival: 1, winner: 2 });

  const repick = new SpotReservations({ rng: rolls(0.9), fightChance: 0.35 });
  repick.claim(['3,3'], 1);
  assert.deepEqual(repick.claim(['3,3'], 2), { ok: false, outcome: 'repick', rival: 1 });

  const late = new SpotReservations({ rng: rolls(0.1), windowSec: 1.5 });
  late.claim(['3,3'], 1);
  late.tick(2);
  assert.deepEqual(late.claim(['3,3'], 2), { ok: false, outcome: 'taken', rival: 1 });
  assert.ok(late.blockedFor(2).has('3,3'));
});

test('release paths: release, releaseKey, prune of a despawned holder, transfer', () => {
  const s = new SpotReservations();
  s.claim(['1,1', '2,2'], 1);
  s.claim(['5,5'], 2);
  s.releaseKey('1,1', 2);
  assert.equal(s.holderOf('1,1'), 1, 'only the holder releases a key');
  s.releaseKey('1,1', 1);
  assert.equal(s.holderOf('1,1'), undefined);
  s.transfer(['2,2'], 1, 3);
  assert.equal(s.holderOf('2,2'), 3);
  s.prune((id) => id !== 2);
  assert.equal(s.holderOf('5,5'), undefined, 'despawned holder lost its keys');
  s.release(3);
  assert.equal(s.size, 0);
});

test('seats: synced each frame, never contested, and they outrank a spot', () => {
  const s = new SpotReservations({ rng: rolls(0.1) });
  s.claim(['2,1'], 9); // a cat naps on a sofa seat
  s.syncSeats([
    ['8,1', 1],
    ['2,1', 2],
  ]);
  assert.equal(s.holderOf('2,1'), 2, 'the seat assigned by the user wins');
  assert.equal(s.get('8,1')?.tag, 'seat');
  assert.deepEqual(s.claim(['8,1'], 5), { ok: false, outcome: 'taken', rival: 1 });
  s.syncSeats([['8,1', 1]]);
  assert.equal(s.holderOf('2,1'), undefined, 'an unassigned seat is released');
  assert.deepEqual([...s.holders('seat')], [1]);
});
