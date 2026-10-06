/**
 * Activity animations: the step player (intro, loop, outro), the pose names
 * every activity uses, the sprites of every breed and of a custom coat, and
 * the in-place idles joining the weighted pick.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import { POSE_NAMES } from '../../scripts/cats/poses.mjs';
import { BREED_IDS, renderAppearance, toHex } from '../src/cats/catArt.js';
import type { AnimParts } from '../src/office/engine/activityAnim.js';
import {
  advanceAnim,
  currentStep,
  pose,
  st,
  startAnim,
} from '../src/office/engine/activityAnim.js';
import { chooseIdleActivity, IDLE_ACTIVITIES } from '../src/office/engine/idleActivities.js';
import { careSpriteFor, getCarePoses } from '../src/office/sprites/petCareFrames.js';
import type { IdleActivityRun, SpriteData } from '../src/office/types.js';
import { Direction } from '../src/office/types.js';

const run = (timer: number): IdleActivityRun => ({ id: 'x', spot: null, phase: 'doing', timer });

test('the player runs the intro once, loops until the time is up, then the outro', () => {
  const anim: AnimParts = {
    intro: [st('stand', 0.5)],
    loop: [st('loaf', 1), st('loafBlink', 1)],
    outro: [st('sitFront', 0.5)],
  };
  const r = run(3);
  startAnim(r, anim);
  const seen: string[] = [];
  let done = false;
  for (let t = 0; t < 10 && !done; t += 0.1) {
    r.timer -= 0.1;
    done = advanceAnim(r, anim, 0.1);
    const step = currentStep(r, anim)!;
    const name = POSE_NAMES[step.f];
    if (seen[seen.length - 1] !== name) seen.push(name);
  }
  assert.ok(done, 'the activity ends');
  assert.deepEqual(seen, ['stand', 'loaf', 'loafBlink', 'loaf', 'loafBlink', 'sitFront']);
});

test('a loop always ends on its last step: no motion is cut halfway', () => {
  const anim: AnimParts = { loop: [st('scrA', 1), st('scrB', 1)] };
  const r = run(0.5);
  startAnim(r, anim);
  let t = 0;
  while (!advanceAnim(r, anim, 0.1) && t < 10) {
    r.timer -= 0.1;
    t += 0.1;
  }
  assert.ok(t >= 1.8, `the loop plays to its end (${t.toFixed(1)} s)`);
});

test('an empty loop stops after the intro (the tunnel run drives that part)', () => {
  const anim: AnimParts = { intro: [st('yarnStalk', 0.2)], loop: [] };
  const r = run(5);
  startAnim(r, anim);
  for (let i = 0; i < 10 && r.part === 'intro'; i++) {
    assert.equal(advanceAnim(r, anim, 0.1), false, 'not over: the run comes next');
  }
  assert.equal(r.part, 'loop');
});

test('pose names resolve, a typo throws', () => {
  assert.equal(POSE_NAMES[pose('napOut')], 'napOut');
  assert.throws(() => pose('napOutt'), /unknown cat pose/);
  assert.equal(new Set(POSE_NAMES).size, POSE_NAMES.length, 'pose names are unique');
});

test('every activity has steps of its own: each toy and idle plays a distinct animation', () => {
  const sig = (id: string) => {
    const d = IDLE_ACTIVITIES.find((a) => a.id === id)!;
    return JSON.stringify([d.intro ?? [], d.loop, d.outro ?? []].map((s) => s.map((x) => x.f)));
  };
  const toys = ['scratch', 'yarn', 'box', 'catTree', 'tunnel', 'mouse', 'teaser'];
  const idles = ['groom', 'yawn', 'stretch', 'tailChase', 'loaf', 'brew', 'skillRead'];
  const sigs = [...toys, ...idles].map(sig);
  assert.equal(new Set(sigs).size, sigs.length, 'no two activities share one animation');
  for (const id of [...toys, ...idles]) {
    const d = IDLE_ACTIVITIES.find((a) => a.id === id)!;
    const n = new Set([...(d.intro ?? []), ...d.loop, ...(d.outro ?? [])].map((s) => s.f)).size;
    assert.ok(n >= 3, `${id} uses ${n} poses`);
  }
});

/** Opaque pixels of a frame. */
const ink = (s: SpriteData) => s.flat().filter(Boolean).length;

test('every breed and a custom coat render every pose in every row', () => {
  const custom = {
    breed: 'patches',
    pattern: 'calico' as const,
    colors: {
      fur: toHex([246, 242, 236]),
      patchA: toHex([232, 196, 150]),
      patchB: toHex([140, 146, 164]),
    },
  };
  for (const look of [...BREED_IDS.map((breed) => ({ breed })), custom]) {
    const frames = renderAppearance(look);
    for (const dir of ['down', 'up', 'right'] as const) {
      assert.equal(frames[dir].length, 7 + POSE_NAMES.length, `${look.breed} ${dir}`);
      frames[dir].forEach((f, i) => {
        assert.equal(f.length, 32);
        assert.equal(f[0].length, 16);
        assert.ok(ink(f) > 40, `${look.breed} ${dir} frame ${i} is drawn`);
      });
    }
  }
});

test('a custom coat paints its own colours on the new poses', () => {
  const breed = renderAppearance({ breed: 'patches' }).right[7 + pose('mouseLeap')];
  const green = toHex([32, 160, 64]);
  const coat = renderAppearance({ breed: 'patches', colors: { fur: green } }).right[
    7 + pose('mouseLeap')
  ];
  assert.ok(coat.flat().some((px) => px.toLowerCase() === green));
  assert.notDeepEqual(coat, breed);
});

test('in-place idles join the pick; work and chained steps never do', () => {
  const ids = new Set<string>();
  for (let i = 0; i < 400; i++) {
    const pick = chooseIdleActivity(null, new Map(), new Set(), () => i / 400);
    if (pick) ids.add(pick.def.id);
  }
  for (const id of ['groom', 'yawn', 'stretch', 'tailChase', 'loaf']) assert.ok(ids.has(id), id);
  for (const id of ['skillRead', 'coffeeSip', 'coffeeReturn']) assert.ok(!ids.has(id), id);
});

test('pet care poses: crunchy eating, lapping, digging, a purr shiver, a pounce', () => {
  const blank = (): SpriteData => Array.from({ length: 16 }, () => new Array(16).fill(''));
  const body = (): SpriteData => {
    const s = blank();
    for (let y = 6; y < 15; y++) for (let x = 3; x < 14; x++) s[y][x] = 'fur';
    for (let x = 3; x < 14; x++) s[6][x] = s[14][x] = 'line';
    return s;
  };
  const tri = () => [body(), body(), body()] as [SpriteData, SpriteData, SpriteData];
  const frames = {
    walkDown: tri(),
    idleDown: tri(),
    walkUp: tri(),
    idleUp: tri(),
    walkRight: tri(),
    walkLeft: tri(),
    idleRight: tri(),
    idleLeft: tri(),
  };
  const poses = getCarePoses(frames);
  assert.ok(poses.eatRight.length >= 6, 'eating bobs the head over several bites');
  assert.ok(poses.poopRight.length >= 10, 'dig, squat, cover');
  assert.ok(poses.playRight.length >= 8, 'crouch, wiggle, pounce, hops');
  assert.notDeepEqual(poses.petted[0], poses.petted[1], 'the purr shivers');
  const pet = { careAnim: { kind: 'eat', frame: 3 }, dir: Direction.LEFT } as never;
  assert.ok(careSpriteFor(pet, frames));
});
