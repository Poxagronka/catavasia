/**
 * Litter boxes as data and as menus: fill stages, litter wear, refusal at
 * the flies stage, the box / poop radial menu actions, persistence, the
 * variant art, and the pets' side (refuse a box with flies, an accident off
 * the box tiles).
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  PET_LITTER_CAPACITY,
  PET_LITTER_DIRTY_AFTER,
  PET_LITTER_FULL,
  PET_LITTER_USED_AFTER,
} from '../src/constants.js';
import { createPet, updatePet } from '../src/office/engine/petEntity.js';
import {
  isLitterBoxType,
  litterFreshness,
  litterStage,
  sandStage,
} from '../src/office/petCare/litterStages.js';
import type { PetCareEnv } from '../src/office/petCare/petCareNav.js';
import { findLitterBox, floorSpotNear, hitTestCare } from '../src/office/petCare/petCareNav.js';
import { PetCareSystem } from '../src/office/petCare/petCareSystem.js';
import { PetCareWorld } from '../src/office/petCare/petCareWorld.js';
import {
  isHoodedLitterBox,
  LITTER_BOX_TYPES,
  litterBoxSprite,
  litterFrontSprite,
} from '../src/office/sprites/petCareSprites.js';
import type { Pet, PlacedFurniture, TileType as TileTypeVal } from '../src/office/types.js';
import { PetState, TileType } from '../src/office/types.js';

const FRAME = 0.05;
const BOX_A: PlacedFurniture = { uid: 'a', type: 'LITTER_BOX', col: 2, row: 1 };
const BOX_B: PlacedFurniture = { uid: 'b', type: 'LITTER_BOX_SMART', col: 7, row: 1 };

function setup(furniture: PlacedFurniture[]) {
  const pet = createPet('cat', 0, 4, 3);
  const env: PetCareEnv = {
    pets: [pet],
    furniture,
    tileMap: Array.from({ length: 5 }, () =>
      Array.from({ length: 10 }, () => TileType.FLOOR_1 as TileTypeVal),
    ),
    blockedTiles: new Set(),
    isCat: () => true,
  };
  return { pet, env, care: new PetCareSystem() };
}

function run(care: PetCareSystem, env: PetCareEnv, pet: Pet, seconds: number, each?: () => void) {
  for (let t = 0; t < seconds; t += FRAME) {
    care.update(FRAME, env);
    if (!care.isBusy(pet.id)) updatePet(pet, FRAME, [], new Map(), env.tileMap, env.blockedTiles);
    each?.();
  }
}

// ── Stages ─────────────────────────────────────────────────────

test('fill stages: clean, one pile, a few, full, flies', () => {
  assert.equal(litterStage(0), 'clean');
  assert.equal(litterStage(1), 'one');
  assert.equal(litterStage(2), 'few');
  assert.equal(litterStage(3), 'few');
  assert.equal(litterStage(PET_LITTER_FULL), 'full');
  assert.equal(litterStage(PET_LITTER_CAPACITY), 'flies');
  assert.equal(sandStage(0), 0);
  assert.equal(sandStage(PET_LITTER_USED_AFTER), 1);
  assert.equal(sandStage(PET_LITTER_DIRTY_AFTER), 2);
  assert.equal(litterFreshness(0), 100);
  assert.equal(litterFreshness(PET_LITTER_DIRTY_AFTER), 0);
});

test('a box takes piles up to the capacity; full stinks, flies refuse', () => {
  const w = new PetCareWorld();
  for (let i = 0; i < PET_LITTER_FULL; i++) assert.ok(w.deposit('box'));
  assert.ok(w.isBoxFull('box'));
  assert.equal(w.isBoxRefused('box'), false);
  // A full box still takes one more (grudgingly): then it overflows with flies.
  assert.ok(w.deposit('box'));
  assert.ok(w.isBoxRefused('box'));
  assert.equal(w.deposit('box'), false);
  assert.equal(w.poop('cat', 'box', 3, 4), 'floor');
  assert.equal(w.litterUses('box'), PET_LITTER_CAPACITY);
});

test('Clean keeps the litter wear; Change litter resets piles and wear', () => {
  const w = new PetCareWorld();
  for (let i = 0; i < 3; i++) w.deposit('box');
  assert.equal(w.cleanBox('box'), 3);
  assert.equal(w.litterUses('box'), 3);
  assert.ok(w.changeLitter('box'));
  assert.equal(w.boxCount('box'), 0);
  assert.equal(w.litterUses('box'), 0);
  assert.equal(w.changeLitter('box'), false);
});

test('every variant is a litter box with its own art per stage', () => {
  assert.deepEqual([...LITTER_BOX_TYPES].sort(), [
    'LITTER_BOX',
    'LITTER_BOX_CORNER',
    'LITTER_BOX_HIGH',
    'LITTER_BOX_HOODED',
    'LITTER_BOX_SMART',
  ]);
  for (const type of LITTER_BOX_TYPES) {
    assert.ok(isLitterBoxType(type), type);
    const sprites = [0, 1, 2, 3, 4, 5].map((n) => litterBoxSprite(type, n, 1));
    assert.equal(new Set(sprites).size, 6, `${type}: one sprite per pile count`);
    assert.notEqual(litterBoxSprite(type, 0, 0), litterBoxSprite(type, 0, 2), `${type} sand`);
    // The front wall keeps only the bottom rows.
    const front = litterFrontSprite(type, sprites[0]!);
    assert.ok(front[0].every((px) => px === ''));
    assert.ok(front[front.length - 4].some((px) => px !== ''));
  }
  assert.equal(isLitterBoxType('PET_BOWL'), false);
  assert.ok(isHoodedLitterBox('LITTER_BOX_HOODED'));
  assert.equal(isHoodedLitterBox('LITTER_BOX'), false);
});

// ── Menus ──────────────────────────────────────────────────────

test('box menu: Clean scoops the piles out, Change litter pours fresh, Info toggles', () => {
  const { pet, env, care } = setup([BOX_A]);
  care.world.boxes.set('a', 3);
  care.world.litter.set('a', 8);
  const hit = hitTestCare(BOX_A.col * 16 + 8, BOX_A.row * 16 + 8, env.furniture, care.world);
  assert.equal(hit?.kind, 'box');
  care.openCareMenu({ kind: 'box', uid: 'a' });
  care.careAct('info', env);
  assert.equal(care.infoOpen, true);
  assert.deepEqual(care.careMenu, { kind: 'box', uid: 'a' });
  care.careAct('clean', env);
  assert.equal(care.careMenu, null);
  assert.ok(care.effects.some((e) => e.kind === 'scoop'));
  // The piles go when the scoop lifts them out.
  assert.equal(care.world.boxCount('a'), 3);
  run(care, env, pet, 1);
  assert.equal(care.world.boxCount('a'), 0);
  assert.equal(care.world.litterUses('a'), 8);

  care.openCareMenu({ kind: 'box', uid: 'a' });
  care.careAct('change', env);
  assert.equal(care.world.litterUses('a'), 0);
  assert.ok(care.effects.some((e) => e.kind === 'pour'));
  assert.ok(care.effects.some((e) => e.kind === 'glint'));
});

test('poop menu: Clean up bags the pile; the menu closes when the poop is gone', () => {
  const { pet, env, care } = setup([]);
  care.world.floorPoop(5, 3);
  const id = care.world.floorPoops[0].id;
  assert.equal(hitTestCare(5 * 16 + 8, 3 * 16 + 8, [], care.world)?.kind, 'poop');
  care.openCareMenu({ kind: 'poop', id });
  care.careAct('cleanup', env);
  assert.ok(care.effects.some((e) => e.kind === 'bag'));
  run(care, env, pet, 1);
  assert.equal(care.world.floorPoops.length, 0);
  // Opening a menu on a poop someone else cleaned: it closes itself.
  care.world.floorPoop(1, 1);
  care.openCareMenu({ kind: 'poop', id: care.world.floorPoops[0].id });
  care.world.cleanFloorPoop(care.world.floorPoops[0].id);
  run(care, env, pet, FRAME);
  assert.equal(care.careMenu, null);
});

test('the cat menu and the box menu never show together', () => {
  const { pet, care } = setup([BOX_A]);
  care.openMenu(pet);
  care.openCareMenu({ kind: 'box', uid: 'a' });
  assert.equal(care.menuPetId, null);
  care.openMenu(pet);
  assert.equal(care.careMenu, null);
});

// ── Persistence ────────────────────────────────────────────────

test('box piles and litter wear persist; an old snapshot loads with fresh litter', () => {
  const w = new PetCareWorld();
  w.deposit('a');
  w.deposit('a');
  const snap = w.toSnapshot(1000);
  assert.deepEqual(snap.boxes, { a: 2 });
  assert.deepEqual(snap.litter, { a: 2 });
  const back = PetCareWorld.fromSnapshot(JSON.parse(JSON.stringify(snap)), 1000);
  assert.equal(back.boxCount('a'), 2);
  assert.equal(back.litterUses('a'), 2);
  const old = PetCareWorld.fromSnapshot(
    { version: 1, savedAt: 1000, pets: {}, bowls: {}, boxes: { a: 9 }, floorPoops: [] },
    1000,
  );
  assert.equal(old.boxCount('a'), PET_LITTER_CAPACITY);
  assert.equal(old.litterUses('a'), 0);
});

// ── Pets ───────────────────────────────────────────────────────

test('a pet refuses the box with flies (grimace) and uses the other box', () => {
  const { pet, env, care } = setup([BOX_A, BOX_B]);
  pet.wanderTimer = 1e9;
  care.world.boxes.set('a', PET_LITTER_CAPACITY);
  care.world.entry(pet.id).bowel = 100;
  let grimaced = false;
  run(care, env, pet, 25, () => {
    grimaced ||= pet.careAnim?.kind === 'grimace';
  });
  assert.ok(grimaced, 'the cat grimaces at the overflowing box');
  assert.equal(care.world.boxCount('a'), PET_LITTER_CAPACITY);
  assert.equal(care.world.boxCount('b'), 1);
  assert.equal(care.world.floorPoops.length, 0);
});

test('every box refused: the pet has an accident on the floor, never on a box tile', () => {
  const { pet, env, care } = setup([BOX_A]);
  pet.wanderTimer = 1e9;
  care.world.boxes.set('a', PET_LITTER_CAPACITY);
  care.world.entry(pet.id).bowel = 100;
  run(care, env, pet, 25);
  assert.equal(care.world.floorPoops.length, 1);
  const p = care.world.floorPoops[0];
  assert.notDeepEqual([p.col, p.row], [BOX_A.col, BOX_A.row]);
  assert.ok(care.world.entry(pet.id).bowel < 100);
});

test('the floor spot for an accident skips boxes, poops and taken tiles', () => {
  const w = new PetCareWorld();
  w.floorPoop(3, 1);
  const env = {
    furniture: [BOX_A],
    tileMap: Array.from({ length: 3 }, () =>
      Array.from({ length: 5 }, () => TileType.FLOOR_1 as TileTypeVal),
    ),
    blockedTiles: new Set<string>(),
  };
  const spot = floorSpotNear(2, 1, env, w, (k) => k !== '1,1');
  assert.ok(spot);
  assert.ok(!['2,1', '3,1', '1,1'].includes(`${spot.col},${spot.row}`));
});

test('a refused box counts again once it is cleaned', () => {
  const { pet, env, care } = setup([BOX_A]);
  care.world.boxes.set('a', PET_LITTER_CAPACITY);
  const refused = new Set(['a']);
  assert.equal(
    findLitterBox(pet, env, care.world, () => true, refused),
    null,
  );
  care.world.cleanBox('a');
  assert.equal(findLitterBox(pet, env, care.world, () => true, refused)?.uid, 'a');
});

test('pet zoomies: a sprint is faster than a walk', () => {
  const env = setup([]).env;
  const walker = createPet('w', 0, 0, 2);
  const runner = createPet('r', 0, 0, 2);
  runner.sprint = true;
  for (const p of [walker, runner]) {
    p.path = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((col) => ({ col, row: 2 }));
    p.state = PetState.WALK;
  }
  for (let t = 0; t < 1; t += FRAME) {
    for (const p of [walker, runner])
      updatePet(p, FRAME, [], new Map(), env.tileMap, env.blockedTiles);
  }
  assert.ok(runner.x > walker.x * 1.5, `${runner.x} vs ${walker.x}`);
});
