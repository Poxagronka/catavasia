/**
 * Unit tests for pet care (tamagotchi needs for cat pets).
 *
 * Covers: need decay + clamping, persistence round-trip, offline catch-up,
 * request triggers + meows, bowl consumption/refill, the poop/clean cycle,
 * radial-menu action effects, the autonomous walk-to-bowl loop, the
 * activity-provider seam (incl. the coffee rule) and the derived care poses.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  PET_ANIM_EAT_SEC,
  PET_ANIM_PETTED_SEC,
  PET_ANIM_POOP_SEC,
  PET_BOWL_FOOD_PER_MEAL,
  PET_BOWL_MAX,
  PET_BOWL_WATER_PER_DRINK,
  PET_GAIN_SCRATCH,
  PET_LITTER_CAPACITY,
  PET_MEOW_INTERVAL_SEC,
  PET_NEED_DECAY_PER_HOUR,
  PET_NEED_MAX,
  PET_OFFLINE_MAX_CATCHUP_HOURS,
} from '../src/constants.js';
import { createPet, updatePet } from '../src/office/engine/petEntity.js';
import type { PetCareEnv } from '../src/office/petCare/petCareNav.js';
import { hitTestCare } from '../src/office/petCare/petCareNav.js';
import { PetCareSystem } from '../src/office/petCare/petCareSystem.js';
import { PetCareWorld } from '../src/office/petCare/petCareWorld.js';
import {
  clampNeed,
  decayNeeds,
  freshNeeds,
  moodLabel,
  moodScore,
  offlineCatchUpHours,
  pickRequest,
  sanitizeNeeds,
} from '../src/office/petCare/petNeeds.js';
import { buildCarePoses } from '../src/office/sprites/petCareFrames.js';
import type { PetSpriteFrames } from '../src/office/sprites/petSpriteData.js';
import type {
  Pet,
  PlacedFurniture,
  SpriteData,
  TileType as TileTypeVal,
} from '../src/office/types.js';
import { PetState, TileType } from '../src/office/types.js';

const HOUR_MS = 3_600_000;
const FRAME = 0.05;

function openMap(cols: number, rows: number): TileTypeVal[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => TileType.FLOOR_1 as TileTypeVal),
  );
}

const BOWL: PlacedFurniture = { uid: 'bowl', type: 'PET_BOWL', col: 5, row: 2 };
const BOX: PlacedFurniture = { uid: 'box', type: 'LITTER_BOX', col: 8, row: 2 };

function setup(furniture: PlacedFurniture[] = [BOWL, BOX]) {
  const pet = createPet('cat', 0, 1, 2);
  const env: PetCareEnv = {
    pets: [pet],
    furniture,
    tileMap: openMap(10, 5),
    // The bowl blocks its tile; the litter box tile stays walkable.
    blockedTiles: new Set(
      furniture.filter((f) => f.type === 'PET_BOWL').map((f) => `${f.col},${f.row}`),
    ),
    isCat: () => true,
  };
  const care = new PetCareSystem();
  return { pet, env, care };
}

/** Advance care + the wander FSM like OfficeState.update does. */
function run(care: PetCareSystem, env: PetCareEnv, pet: Pet, seconds: number): void {
  for (let t = 0; t < seconds; t += FRAME) {
    care.update(FRAME, env);
    if (!care.isBusy(pet.id)) updatePet(pet, FRAME, [], new Map(), env.tileMap, env.blockedTiles);
  }
}

/** Keep the cat from wandering off on its own during a test. */
function stayPut(pet: Pet): void {
  pet.wanderTimer = 1e9;
}

// ── Needs ──────────────────────────────────────────────────────

test('needs decay per office hour and clamp to 0..max', () => {
  const n = freshNeeds();
  decayNeeds(n, 1, { floorPoops: 0, fullBoxes: 0 });
  assert.equal(n.hunger, 80 - PET_NEED_DECAY_PER_HOUR.hunger);
  assert.equal(n.thirst, 80 - PET_NEED_DECAY_PER_HOUR.thirst);
  decayNeeds(n, 100, { floorPoops: 0, fullBoxes: 0 });
  assert.equal(n.hunger, 0);
  assert.equal(clampNeed(250), PET_NEED_MAX);
  assert.equal(clampNeed(Number.NaN), 0);
});

test('floor poops and full boxes speed up hygiene loss', () => {
  const clean = freshNeeds();
  const dirty = freshNeeds();
  decayNeeds(clean, 1, { floorPoops: 0, fullBoxes: 0 });
  decayNeeds(dirty, 1, { floorPoops: 2, fullBoxes: 1 });
  assert.ok(dirty.hygiene < clean.hygiene);
  assert.equal(dirty.hunger, clean.hunger);
});

test('sanitizeNeeds clamps junk and fills missing keys', () => {
  const n = sanitizeNeeds({ hunger: 500, thirst: -3, fun: 'x' });
  assert.equal(n.hunger, PET_NEED_MAX);
  assert.equal(n.thirst, 0);
  assert.equal(n.fun, freshNeeds().fun);
});

test('mood follows the lowest need', () => {
  const n = freshNeeds();
  assert.equal(moodLabel(moodScore(n)), 'Happy');
  n.hygiene = 0;
  assert.notEqual(moodLabel(moodScore(n)), 'Happy');
});

// ── Persistence + offline ─────────────────────────────────────

test('snapshot round-trips through JSON', () => {
  const w = new PetCareWorld();
  w.entry('cat').needs.fun = 42;
  w.bowl('bowl').food = 10;
  w.boxes.set('box', 2);
  w.poop('cat', null, 3, 4);
  const now = Date.now();
  const back = PetCareWorld.fromSnapshot(JSON.parse(JSON.stringify(w.toSnapshot(now))), now);
  assert.deepEqual(back.toSnapshot(now), w.toSnapshot(now));
});

test('fromSnapshot survives garbage', () => {
  const w = PetCareWorld.fromSnapshot(
    {
      pets: { cat: { needs: 'nope', bowel: 1e9 } },
      bowls: { b: { food: -5 } },
      floorPoops: [1, {}],
    },
    Date.now(),
  );
  assert.equal(w.entry('cat').bowel, 100);
  assert.equal(w.bowl('b').food, 0);
  assert.equal(w.floorPoops.length, 0);
});

test('offline time decays slowly and is capped', () => {
  assert.equal(offlineCatchUpHours(-5), 0);
  assert.ok(offlineCatchUpHours(HOUR_MS) < 1);
  assert.equal(offlineCatchUpHours(1000 * HOUR_MS), PET_OFFLINE_MAX_CATCHUP_HOURS);
  const now = Date.now();
  const snap = new PetCareWorld();
  snap.entry('cat');
  const weekAway = PetCareWorld.fromSnapshot(snap.toSnapshot(now - 7 * 24 * HOUR_MS), now);
  const cap = PET_OFFLINE_MAX_CATCHUP_HOURS * PET_NEED_DECAY_PER_HOUR.thirst;
  assert.equal(weekAway.entry('cat').needs.thirst, 80 - cap);
});

// ── Requests ──────────────────────────────────────────────────

test('pickRequest returns the lowest need under the threshold', () => {
  const n = freshNeeds();
  assert.equal(pickRequest(n), null);
  n.fun = 30;
  n.thirst = 10;
  assert.equal(pickRequest(n), 'water');
});

test('a new request meows once, then waits PET_MEOW_INTERVAL_SEC', () => {
  const { pet, env, care } = setup([]);
  stayPut(pet);
  let meows = 0;
  care.onMeow = () => meows++;
  care.world.entry(pet.id).needs.affection = 5;
  run(care, env, pet, 1);
  assert.equal(care.requestOf(pet.id), 'scratch');
  assert.equal(meows, 1);
  run(care, env, pet, 10);
  assert.equal(meows, 1);
  run(care, env, pet, PET_MEOW_INTERVAL_SEC);
  assert.equal(meows, 2);
});

// ── Bowl ──────────────────────────────────────────────────────

test('eating and drinking empty the bowl; refill tops it up', () => {
  const w = new PetCareWorld();
  w.entry('cat').needs.hunger = 10;
  assert.ok(w.eat('cat', 'bowl'));
  assert.equal(w.bowl('bowl').food, PET_BOWL_MAX - PET_BOWL_FOOD_PER_MEAL);
  assert.ok(w.entry('cat').needs.hunger > 10);
  assert.ok(w.drink('cat', 'bowl'));
  assert.equal(w.bowl('bowl').water, PET_BOWL_MAX - PET_BOWL_WATER_PER_DRINK);
  w.bowl('bowl').food = 0;
  assert.equal(w.eat('cat', 'bowl'), false);
  w.refillBowl('bowl');
  assert.deepEqual(w.bowl('bowl'), { food: PET_BOWL_MAX, water: PET_BOWL_MAX });
});

test('a hungry cat walks to the bowl, eats and gets hearts', () => {
  const { pet, env, care } = setup();
  care.world.entry(pet.id).needs.hunger = 20;
  run(care, env, pet, 10 + PET_ANIM_EAT_SEC);
  assert.equal(pet.tileRow, BOWL.row);
  assert.equal(Math.abs(pet.tileCol - BOWL.col), 1);
  assert.ok(care.world.entry(pet.id).needs.hunger > 20);
  assert.ok(care.world.bowl(BOWL.uid).food < PET_BOWL_MAX);
});

// ── Poop + clean ──────────────────────────────────────────────

test('poops fill the box, then land on the floor; cleaning restores hygiene', () => {
  const w = new PetCareWorld();
  for (let i = 0; i < PET_LITTER_CAPACITY; i++) assert.equal(w.poop('cat', 'box', 0, 0), 'box');
  assert.ok(w.isBoxFull('box'));
  assert.equal(w.poop('cat', 'box', 3, 4), 'floor');
  assert.equal(w.floorPoops.length, 1);
  const before = w.entry('cat').needs.hygiene;
  assert.equal(w.cleanBox('box'), PET_LITTER_CAPACITY);
  assert.ok(w.cleanFloorPoop(w.floorPoops[0].id));
  assert.ok(w.entry('cat').needs.hygiene > before);
  assert.equal(w.cleanBox('box'), 0);
});

test('a full bowel sends the cat to the litter box', () => {
  const { pet, env, care } = setup();
  care.world.entry(pet.id).bowel = 100;
  run(care, env, pet, 12 + PET_ANIM_POOP_SEC);
  assert.equal(care.world.boxCount(BOX.uid), 1);
  assert.equal(care.world.entry(pet.id).bowel < 100, true);
});

test('with no box the cat poops on the floor; a click on it cleans it', () => {
  const { pet, env, care } = setup([BOWL]);
  stayPut(pet);
  care.world.entry(pet.id).bowel = 100;
  // It walks to a random free floor tile first (petCare/poopSpots.ts).
  run(care, env, pet, 20 + PET_ANIM_POOP_SEC);
  assert.equal(care.world.floorPoops.length, 1);
  const p = care.world.floorPoops[0];
  const hit = hitTestCare(p.col * 16 + 8, p.row * 16 + 8, env.furniture, care.world);
  assert.equal(hit?.kind, 'poop');
  assert.ok(hit?.kind === 'poop' && care.cleanFloorPoop(hit.id));
  // The bag comes down first; the pile is gone once it is in the bag.
  assert.equal(care.world.floorPoops.length, 1);
  run(care, env, pet, 1);
  assert.equal(care.world.floorPoops.length, 0);
});

// ── Radial menu ───────────────────────────────────────────────

test('Scratch plays the petted pose, raises affection, shows hearts', () => {
  const { pet, env, care } = setup([]);
  stayPut(pet);
  care.world.entry(pet.id).needs.affection = 10;
  care.openMenu(pet);
  care.act(pet, 'scratch', env);
  assert.equal(care.menuPetId, null);
  run(care, env, pet, 0.2);
  assert.equal(pet.careAnim?.kind, 'petted');
  assert.ok(care.effects.some((e) => e.kind === 'heart'));
  run(care, env, pet, PET_ANIM_PETTED_SEC);
  assert.equal(pet.careAnim, null);
  assert.ok(care.world.entry(pet.id).needs.affection >= 10 + PET_GAIN_SCRATCH - 1);
});

test('Feed refills the bowl and sends the cat to it; without a bowl it hand-feeds', () => {
  const a = setup();
  a.care.world.bowl(BOWL.uid).food = 0;
  a.care.act(a.pet, 'feed', a.env);
  assert.equal(a.care.world.bowl(BOWL.uid).food, PET_BOWL_MAX);
  assert.equal(a.pet.state, PetState.WALK);

  const b = setup([]);
  stayPut(b.pet);
  b.care.world.entry(b.pet.id).needs.hunger = 10;
  b.care.act(b.pet, 'feed', b.env);
  assert.ok(b.care.hasDish(b.pet.id));
  run(b.care, b.env, b.pet, PET_ANIM_EAT_SEC + 0.2);
  assert.ok(b.care.world.entry(b.pet.id).needs.hunger > 10);
});

test('Clean empties boxes and floor; Info toggles the panel and keeps the menu', () => {
  const { pet, env, care } = setup();
  care.world.boxes.set(BOX.uid, 2);
  care.world.poop(pet.id, null, 0, 0);
  care.openMenu(pet);
  care.act(pet, 'info', env);
  assert.equal(care.infoOpen, true);
  assert.equal(care.menuPetId, pet.id);
  care.act(pet, 'clean', env);
  assert.equal(care.menuPetId, null);
  // The scoop and the bag take their piles out a moment later.
  run(care, env, pet, 1);
  assert.equal(care.world.boxCount(BOX.uid), 0);
  assert.equal(care.world.floorPoops.length, 0);
});

test('saves only after load, through onSave', () => {
  const { pet, env, care } = setup([]);
  const saved: unknown[] = [];
  care.onSave = (s) => saved.push(s);
  run(care, env, pet, 1);
  care.flush();
  assert.equal(saved.length, 0);
  care.load(null, Date.now());
  run(care, env, pet, 1);
  care.flush();
  assert.equal(saved.length, 1);
});

// ── Seam ──────────────────────────────────────────────────────

test('activity providers reach content cats; coffee claims are refused', () => {
  const { pet, env, care } = setup([]);
  const offered: string[] = [];
  care.registerActivityProvider({
    claimIdle: () => {
      offered.push('coffee');
      return { kind: 'drink', col: 4, row: 2, furnitureType: 'COFFEE', durationSec: 1 };
    },
  });
  care.registerActivityProvider({
    claimIdle: () => ({ kind: 'toy', col: 3, row: 2, durationSec: 1, gains: { fun: 10 } }),
  });
  care.world.entry(pet.id).needs.fun = 50;
  run(care, env, pet, 6);
  assert.ok(offered.length > 0);
  assert.equal(pet.tileCol, 3);
  assert.ok(care.world.entry(pet.id).needs.fun > 50);
});

// ── Poses ─────────────────────────────────────────────────────

test('care poses derive from the sheet and keep frame sizes', () => {
  const blank = (w: number): SpriteData =>
    Array.from({ length: 32 }, () => Array<string>(w).fill(''));
  const side = blank(32);
  for (let y = 18; y < 30; y++) for (let x = 4; x < 26; x++) side[y][x] = 'ink';
  const front = blank(16);
  for (let y = 18; y < 30; y++) for (let x = 3; x < 13; x++) front[y][x] = 'ink';
  const t = <T>(v: T): [T, T, T] => [v, v, v];
  const sheet: PetSpriteFrames = {
    walkDown: t(front),
    idleDown: t(front),
    walkUp: t(front),
    idleUp: t(front),
    walkRight: t(side),
    walkLeft: t(side),
    idleRight: t(front),
    idleLeft: t(front),
  };
  const poses = buildCarePoses(sheet);
  assert.equal(poses.eatRight[0][0].length, 32);
  assert.notDeepEqual(poses.eatRight[0], side);
  assert.notDeepEqual(poses.poopRight[0], side);
  assert.equal(poses.petted[0].length, 32);
  assert.equal(poses.playRight[0].length, poses.playRight[1].length);
});
