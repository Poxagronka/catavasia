/**
 * Narrator hover line of an idle cat: the last work line gives way to an
 * idle line in the cat voice a short while after it arrives.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import { idleLine, NARRATOR_IDLE_AFTER_MS, showsIdleLine } from '../src/narratorIdle.js';

const run = (id: string) => ({ id, spot: null, phase: 'doing' as const, timer: 1 });

test('an idle cat shows its idle activity in the cat voice', () => {
  assert.equal(idleLine({ activity: run('coffee'), social: undefined }), 'sipping coffee');
  assert.equal(idleLine({ activity: run('sleep'), social: undefined }), 'taking a catnap');
  assert.equal(idleLine({ activity: run('wander'), social: undefined }), 'on a stroll');
  assert.equal(idleLine({ activity: run('yarn'), social: undefined }), 'playing');
  assert.equal(idleLine({ activity: null, social: undefined }), 'lounging around');
  const fight = { pose: null, frame: 0, bubble: null, anger: 1, cloud: null };
  assert.equal(idleLine({ activity: null, social: fight }), 'squabbling');
});

test('the work line gives way only on an idle cat, after the delay, and never while it waits', () => {
  const now = 100_000;
  const old = now - NARRATOR_IDLE_AFTER_MS;
  assert.equal(showsIdleLine({ state: 'editing', at: old }, false, now), true);
  assert.equal(showsIdleLine({ state: 'done', at: old }, false, now), true);
  assert.equal(showsIdleLine({ state: 'done', at: now - 1000 }, false, now), false, 'fresh');
  assert.equal(showsIdleLine({ state: 'editing', at: old }, true, now), false, 'working');
  assert.equal(showsIdleLine({ state: 'waiting', at: old }, false, now), false, 'waits for you');
});
