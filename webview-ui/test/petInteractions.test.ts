/**
 * Pet interactions (docs/catavasia/pet-interactions.md): a cat pet picks
 * every toy and bed the agent cats use, plays its own pose there (steps in
 * engine/petPlayAnims.ts, poses derived in sprites/petPlayFrames.ts), and a
 * sheet with missing or blank frames never crashes the renderer.
 * The orientation side lives in the guard test (furnitureRotation.test.ts).
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import { PET_TOY_FUN_GAIN } from '../src/constants.js';
import type { PetActivityHost } from '../src/office/engine/petActivities.js';
import {
  PET_NAP_IDS,
  PET_TOY_IDS,
  PetActivities,
  petAnimFor,
} from '../src/office/engine/petActivities.js';
import { createPet, getPetSpriteData, updatePet } from '../src/office/engine/petEntity.js';
import {
  PET_PLAY_ANIMS,
  petPlayFx,
  petPlaySec,
  petPlayStep,
  petPlayView,
  petToyMotion,
} from '../src/office/engine/petPlayAnims.js';
import type { PetCareEnv } from '../src/office/petCare/petCareNav.js';
import { PetCareSystem } from '../src/office/petCare/petCareSystem.js';
import { freshNeeds } from '../src/office/petCare/petNeeds.js';
import { buildPlayPoses, PET_POSE_NAMES } from '../src/office/sprites/petPlayFrames.js';
import type { PetSpriteFrames } from '../src/office/sprites/petSpriteData.js';
import type {
  ActivitySpot,
  Pet,
  PetPlayAnim,
  SpriteData,
  TileType as TileTypeVal,
} from '../src/office/types.js';
import { Direction, TileType } from '../src/office/types.js';

// Color names, not hex: the poses only move pixels around (like petCare.test.ts).
const C = 'ink';
const F = 'fur';

/** A 16x32 or 32x32 frame with a small outlined blob at the bottom. */
function blob(w: number): SpriteData {
  return Array.from({ length: 32 }, (_, y) =>
    Array.from({ length: w }, (_, x) => {
      if (y < 18 || x < 2 || x > w - 3) return '';
      return y === 18 || y === 31 || x === 2 || x === w - 3 ? C : F;
    }),
  );
}

function sheet(frame: (w: number) => SpriteData): PetSpriteFrames {
  const t = (w: number) => [frame(w), frame(w), frame(w)] as [SpriteData, SpriteData, SpriteData];
  return {
    walkDown: t(16),
    idleDown: t(16),
    walkUp: t(16),
    idleUp: t(16),
    walkRight: t(32),
    walkLeft: t(32),
    idleRight: t(16),
    idleLeft: t(16),
  };
}

const spot = (extra: Partial<ActivitySpot> = {}): ActivitySpot => ({
  key: '3,3',
  col: 3,
  row: 3,
  facing: Direction.RIGHT,
  onFurniture: false,
  offsetX: 0,
  offsetY: 0,
  itemUid: 'toy',
  ...extra,
});

const ALL_IDS = [...PET_TOY_IDS, ...PET_NAP_IDS, 'sleep'];

function host(rng: () => number): PetActivityHost {
  const sets = new Map(
    ALL_IDS.map((id, i) => [id, { spots: [spot({ key: `${i},1`, col: i })], fallback: [] }]),
  );
  return {
    spotSets: () => sets,
    furniture: () => [],
    canTarget: () => true,
    claim: () => 'ok',
    start: () => true,
    rng,
  };
}

test('a content pet picks every toy, bed and house the agent cats use', () => {
  let s = 1;
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  const provider = new PetActivities(host(rng));
  const pet = createPet('p', 0, 0, 0);
  const seen = new Set<string>();
  for (let i = 0; i < 4000; i++) {
    const claim = provider.claimIdle(pet, { ...freshNeeds(), energy: 50 });
    if (claim) seen.add(claim.kind);
  }
  for (const id of ALL_IDS) assert.ok(seen.has(id), `never picked "${id}"`);
});

test('each claim carries its own pose; naps refill energy, play raises fun', () => {
  const provider = new PetActivities(host(() => 0.5));
  const pet = createPet('p', 0, 0, 0);
  for (const id of ALL_IDS) {
    const claim = provider.claimAt(pet, id, spot());
    assert.ok(typeof claim === 'object', id);
    assert.equal(claim.anim, petAnimFor(id), id);
    const toy = (PET_TOY_IDS as readonly string[]).includes(id);
    assert.equal(claim.sleep, !toy, `${id}: sleep`);
    assert.equal(claim.gains?.fun ?? 0, toy ? PET_TOY_FUN_GAIN : 0, `${id}: fun`);
  }
  // The tunnel run plays start to end: the claim lasts exactly its length.
  const tunnel = provider.claimAt(pet, 'tunnel', spot({ exit: { col: 7, row: 3 } }));
  assert.ok(typeof tunnel === 'object');
  assert.equal(tunnel.durationSec, petPlaySec('tunnel'));
  assert.deepEqual(tunnel.keys, ['3,3', '7,3']);
  assert.equal(petAnimFor('coffee'), undefined, 'pets never drink coffee');
});

test('a play runs its intro once, loops, and ends on its outro', () => {
  const tree = PET_PLAY_ANIMS.catTree;
  assert.equal(petPlayStep('catTree', 0, 20).step, tree.intro![0]);
  const introSec = tree.intro!.reduce((a, b) => a + b.sec, 0);
  assert.equal(petPlayStep('catTree', introSec + 0.01, 20).step, tree.loop[0]);
  assert.equal(petPlayStep('catTree', 19.99, 20).step, tree.outro![tree.outro!.length - 1]);
  // Too short for the outro: the loop plays to the end instead.
  assert.ok(tree.loop.includes(petPlayStep('catTree', introSec + 0.2, introSec + 0.3).step));
});

test('the tunnel run hides the pet inside the toy and bulges the fabric', () => {
  const sprites = sheet(blob);
  const pet = createPet('p', 0, 3, 3);
  pet.dir = Direction.RIGHT;
  pet.rest = { offsetX: 0, offsetY: 0, zzz: false, exit: { dx: 64, dy: 0 } };
  const intro = PET_PLAY_ANIMS.tunnel.intro!.reduce((a, b) => a + b.sec, 0);
  const at = (t: number) => {
    pet.careAnim = { kind: 'tunnel', frame: 0, t, dur: petPlaySec('tunnel') };
    return petPlayView(pet, sprites)!;
  };
  assert.equal(at(intro + 0.05).hidden, false, 'still at the opening');
  const mid = at(intro + 0.5);
  assert.equal(mid.hidden, true, 'inside');
  assert.equal(mid.dir, Direction.RIGHT);
  assert.equal(petToyMotion(pet, sprites)?.hidden, true);
  assert.ok(petPlayFx(pet, sprites).length > 0, 'the fabric rustles');
  assert.equal(at(intro + 1.5).dir, Direction.LEFT, 'the second pass runs back');
  assert.equal(at(intro + 0.999).hidden, false, 'out at the far end');
});

test('a side pose flips for LEFT; a front pose flips with a mirrored item', () => {
  const sprites = sheet(blob);
  const pet = createPet('p', 0, 3, 3);
  pet.careAnim = { kind: 'mouse', frame: 0, t: 0.1, dur: 10 };
  pet.dir = Direction.RIGHT;
  const right = petPlayView(pet, sprites)!;
  pet.dir = Direction.LEFT;
  const left = petPlayView(pet, sprites)!;
  assert.deepEqual(
    left.sprite,
    right.sprite.map((r) => [...r].reverse()),
  );
  assert.equal(left.x, -right.x, 'the base offset turns with the cat');
  // The yarn ball rolls away from the cat, whichever side it plays on.
  pet.careAnim = { kind: 'yarn', frame: 0, t: 0, dur: 30 };
  const step = (t: number) => {
    pet.careAnim!.t = t;
    return petToyMotion(pet, sprites)!;
  };
  const rolled = [...Array(200).keys()].map((i) => step(i * 0.05)).find((m) => m.dx !== 0)!;
  assert.ok(rolled.dx < 0, 'facing left, the ball rolls left');
});

test('blank, tiny or odd frames never crash a pose, a play or its effects', () => {
  const blank = sheet((w) => Array.from({ length: 32 }, () => new Array<string>(w).fill('')));
  const tiny = sheet(() => [[C]]);
  for (const frames of [blank, tiny, sheet(blob)]) {
    const poses = buildPlayPoses(frames);
    for (const name of PET_POSE_NAMES) assert.ok(poses[name].side, name);
    const pet = createPet('p', 0, 3, 3);
    pet.rest = { offsetX: 0, offsetY: 0, zzz: false, exit: { dx: 0, dy: 48 } };
    for (const kind of Object.keys(PET_PLAY_ANIMS) as PetPlayAnim[]) {
      for (const dir of [Direction.DOWN, Direction.UP, Direction.LEFT, Direction.RIGHT]) {
        pet.dir = dir;
        for (let t = 0; t < 8; t += 0.25) {
          pet.careAnim = { kind, frame: 0, t, dur: 8 };
          assert.ok(getPetSpriteData(pet, frames), `${kind} ${dir} ${t}`);
          petPlayFx(pet, frames);
          petToyMotion(pet, frames);
        }
      }
    }
  }
  // No sheet loaded yet: nothing to draw, no effect, no toy motion.
  const pet = createPet('p', 0, 3, 3);
  pet.careAnim = { kind: 'scratch', frame: 0, t: 1, dur: 8 };
  assert.equal(getPetSpriteData(pet, null), null);
  assert.deepEqual(petPlayFx(pet, null), []);
  assert.equal(petToyMotion(pet, null), null);
});

function openMap(cols: number, rows: number): TileTypeVal[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => TileType.FLOOR_1 as TileTypeVal),
  );
}

test('a joint-play turn plays the toy pose at the pet side, the hop elsewhere', () => {
  const care = new PetCareSystem();
  const pet = createPet('cat', 0, 3, 3);
  const env: PetCareEnv = {
    pets: [pet],
    furniture: [],
    tileMap: openMap(8, 8),
    blockedTiles: new Set(),
    isCat: () => true,
  };
  const side = spot({ facing: Direction.LEFT, offsetX: -4 });
  care.playTurn(pet, 2, 'yarn', side);
  care.update(0.1, env);
  assert.equal(pet.careAnim?.kind, 'yarn');
  assert.equal(pet.dir, Direction.LEFT);
  assert.equal(pet.rest?.offsetX, -4);
  assert.equal(care.currentClaim(pet.id)?.spot?.itemUid, 'toy', 'the toy moves with the turn');
  care.update(2, env);
  assert.equal(pet.careAnim, null, 'the turn ends');
  assert.equal(pet.rest, null);
  care.playTurn(pet, 2, 'yarn', spot({ col: 6 }));
  care.update(0.1, env);
  assert.equal((pet as Pet).careAnim?.kind, 'play', 'away from its side: the hop');
});

test('a scene turning the pet keeps its play pose at the toy; a tunnel run never stretches', () => {
  const care = new PetCareSystem();
  const pet = createPet('cat', 0, 3, 3);
  const env: PetCareEnv = {
    pets: [pet],
    furniture: [],
    tileMap: openMap(8, 8),
    blockedTiles: new Set(),
    isCat: () => true,
  };
  care.playTurn(pet, 2, 'yarn', spot({ facing: Direction.RIGHT }));
  care.update(0.1, env);
  pet.dir = Direction.LEFT; // the scene faces the partner
  const sprites = sheet(blob);
  assert.equal(petPlayView(pet, sprites)?.dir, Direction.RIGHT);
  assert.equal(care.currentClaim(pet.id)?.joint, true, 'a turn is never resumed after a fight');
  care.interrupt(pet);
  // A talk extends a play, but not the fixed tunnel run.
  const provider = new PetActivities(host(() => 0.5));
  const claim = provider.claimAt(pet, 'tunnel', spot({ exit: { col: 7, row: 3 } }));
  assert.ok(typeof claim === 'object');
  assert.ok(care.startClaim(pet, claim, env));
  for (let i = 0; i < 200 && !pet.careAnim; i++) {
    care.update(0.05, env);
    if (!care.isBusy(pet.id)) updatePet(pet, 0.05, [], new Map(), env.tileMap, env.blockedTiles);
  }
  care.extend(pet.id, 5);
  care.update(0.05, env);
  assert.equal(pet.careAnim?.dur, petPlaySec('tunnel'));
});
