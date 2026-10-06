/**
 * Cat life integration: spot reservation at walk start and its release
 * paths, contests (seeded: fight vs re-pick), seats vs napping cats, social
 * cooldown pruning, pets in the idle pool (toys, beds, never coffee), the
 * energy need (decay, sleep restore, persistence back-compat) and talks /
 * joint play inside activities.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { beforeAll, test } from 'vitest';

import { PET_NEED_START } from '../src/constants.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import { mulberry32 } from '../src/office/engine/socialMoves.js';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.js';
import { PetCareWorld } from '../src/office/petCare/petCareWorld.js';
import { NEED_KEYS, pickRequest } from '../src/office/petCare/petNeeds.js';
import { setPetTemplates } from '../src/office/sprites/petSpriteData.js';
import type { Character, OfficeLayout, Pet } from '../src/office/types.js';
import { CharacterState, TileType } from '../src/office/types.js';

const PIXEL = [['']];
const FRAMES = [PIXEL, PIXEL, PIXEL];

beforeAll(() => {
  const asset = (id: string, category: string, w: number, h: number, extra = {}) => ({
    id,
    name: id,
    label: id,
    category,
    file: `${id}.png`,
    width: w * 16,
    height: h * 16,
    footprintW: w,
    footprintH: h,
    isDesk: false,
    canPlaceOnWalls: false,
    ...extra,
  });
  const catalog = [
    asset('SOFA_FRONT', 'chairs', 2, 1, { orientation: 'front' }),
    asset('WOODEN_CHAIR', 'chairs', 1, 1),
    asset('COFFEE', 'misc', 1, 1, { canPlaceOnSurfaces: true }),
    asset('BED_CUSHION', 'beds', 1, 1),
    asset('HOUSE_WOODEN', 'beds', 1, 2, { backgroundTiles: 1 }),
    asset('YARN_BALL', 'toys', 1, 1),
    asset('TOY_MOUSE', 'toys', 1, 1),
  ];
  const sprites = Object.fromEntries(catalog.map((c) => [c.id, PIXEL]));
  assert.ok(buildDynamicCatalog({ catalog, sprites } as never));
  const sheet = { walkDown: FRAMES, idleDown: FRAMES, walkUp: FRAMES, idleUp: FRAMES };
  setPetTemplates([{ ...sheet, walkRight: FRAMES }], ['Gitcat'], ['cat']);
});

/**
 * 14x9 floor. Sofa seats (2,1),(3,1); desk chairs (12,1),(12,3); a mug at
 * (6,5); a cushion bed at (9,6); a wooden house at (11,5..6); yarn at (4,7)
 * and a toy mouse at (7,7).
 */
function office(extra: OfficeLayout['furniture'] = []): OfficeState {
  const cols = 14;
  const rows = 9;
  const os = new OfficeState({
    version: 1,
    cols,
    rows,
    tiles: new Array<TileType>(cols * rows).fill(TileType.FLOOR_1),
    furniture: [
      { uid: 'sofa', type: 'SOFA_FRONT', col: 2, row: 1 },
      { uid: 'chairA', type: 'WOODEN_CHAIR', col: 12, row: 1 },
      { uid: 'chairB', type: 'WOODEN_CHAIR', col: 12, row: 3 },
      { uid: 'mug', type: 'COFFEE', col: 6, row: 5 },
      { uid: 'bed', type: 'BED_CUSHION', col: 9, row: 6 },
      { uid: 'house', type: 'HOUSE_WOODEN', col: 11, row: 5 },
      { uid: 'yarn', type: 'YARN_BALL', col: 4, row: 7 },
      { uid: 'mouse', type: 'TOY_MOUSE', col: 7, row: 7 },
      ...extra,
    ],
  });
  // No encounters of their own: each test starts the scenes it checks.
  os.social.rng = () => 0.99;
  os.life.activitySocial.rng = () => 0.99;
  // No contest fights and seeded idle picks: an idle cat that claims a spot
  // another cat reserved a moment ago re-picks instead of rolling a fight it
  // may win (that made 'the only bed is held' and 'the nap goes on' flaky).
  os.life.claims.spots.rng = () => 0.99;
  os.life.rng = mulberry32(1);
  return os;
}

function idleCat(os: OfficeState, id: number, seat?: string) {
  os.addAgent(id, 0, 0, seat, true);
  os.setAgentActive(id, false);
  const ch = os.characters.get(id)!;
  ch.state = CharacterState.IDLE;
  return ch;
}

/** Put an idle cat on a tile, with no pick due for a while. */
function place(ch: Character, col: number, row: number) {
  ch.tileCol = col;
  ch.tileRow = row;
  ch.x = col * 16 + 8;
  ch.y = row * 16 + 8;
  ch.path = [];
  ch.state = CharacterState.IDLE;
  ch.wanderTimer = 100;
}

function addPet(os: OfficeState, id = 'kit'): Pet {
  os.addPet({ id, petType: 0 });
  return os.pets.find((p) => p.id === id)!;
}

function runFor(os: OfficeState, seconds: number) {
  for (let t = 0; t < seconds; t += 0.05) os.update(0.05);
}

const spots = (os: OfficeState) => os.life.claims.spots;

test('a cat reserves its spot when it starts walking, and releases it after leaving', () => {
  const os = office();
  const ch = idleCat(os, 1, 'chairA');
  assert.ok(os.forceIdleActivity(1, 'bed'));
  assert.equal(ch.state, CharacterState.WALK, 'still walking');
  assert.equal(spots(os).holderOf('9,6'), 1, 'reserved at walk start');
  runFor(os, 15);
  assert.equal(ch.state, CharacterState.ACTIVITY);
  assert.equal(spots(os).get('9,6')?.arrived, true);
  os.setAgentActive(1, true); // work: it leaves
  runFor(os, 0.1);
  assert.equal(spots(os).holderOf('9,6'), undefined, 'released when it left');
});

test('nobody else may target a reserved spot; a despawned cat frees its spots', () => {
  const os = office();
  idleCat(os, 1, 'chairA');
  idleCat(os, 2, 'chairB');
  os.forceIdleActivity(1, 'bed');
  runFor(os, 3); // past the contest window
  assert.equal(os.forceIdleActivity(2, 'bed'), false, 'the only bed is held');
  os.removeAgent(1);
  runFor(os, 1);
  assert.equal(spots(os).holderOf('9,6'), undefined);
  assert.ok(os.forceIdleActivity(2, 'bed'));
});

test('contention: two cats claim one bed at once — seeded fight or a re-pick', () => {
  // Fight: the roll is under the fight chance; the fight scene starts.
  const os = office();
  const a = idleCat(os, 1, 'chairA');
  const b = idleCat(os, 2, 'chairB');
  place(a, 8, 4);
  place(b, 10, 4);
  spots(os).rng = () => 0.1; // fight, and the newcomer (cat 2) wins
  assert.ok(os.forceIdleActivity(1, 'bed', '9,6'));
  assert.ok(os.forceIdleActivity(2, 'bed', '9,6'));
  assert.equal(os.social.sceneInfo(1)?.kind, 'fight');
  assert.equal(spots(os).holderOf('9,6'), 2, 'the winner holds the bed');
  runFor(os, 25);
  assert.equal(b.activity?.id, 'bed', 'the winner walks back and naps');
  assert.notEqual(a.activity?.spot?.key, '9,6', 'the loser picked something else');

  // Re-pick: the roll is over the fight chance; no scene.
  const os2 = office();
  idleCat(os2, 1, 'chairA');
  idleCat(os2, 2, 'chairB');
  spots(os2).rng = () => 0.9;
  assert.ok(os2.forceIdleActivity(1, 'bed', '9,6'));
  assert.equal(os2.forceIdleActivity(2, 'bed', '9,6'), false);
  assert.equal(os2.social.sceneInfo(2), null);
  assert.equal(spots(os2).holderOf('9,6'), 1);
});

test('a new agent is never seated on a sofa seat a cat naps on', () => {
  const os = office();
  idleCat(os, 1, 'chairA');
  idleCat(os, 2, 'chairB');
  os.forceIdleActivity(1, 'sleep', '2,1');
  runFor(os, 10);
  os.addAgent(3, 0, 0, 'sofa', true); // asks for the napped seat, even
  const seatId = os.characters.get(3)!.seatId;
  const seat = seatId ? os.seats.get(seatId) : undefined;
  assert.notDeepEqual([seat?.seatCol, seat?.seatRow], [2, 1]);
  assert.equal(os.characters.get(1)!.activity?.id, 'sleep', 'the nap goes on');
});

test('social cooldowns expire and their entries are pruned (no leak for removed cats)', () => {
  const os = office();
  const a = idleCat(os, 1, 'chairA');
  const b = idleCat(os, 2, 'chairB');
  os.social.rng = mulberry32(3);
  place(a, 6, 3);
  place(b, 7, 3);
  assert.ok(os.social.trySocialEncounter(a, b, { kind: 'talk' }));
  runFor(os, 30);
  assert.ok(os.social.cooldownCount > 0);
  os.removeAgent(1);
  os.removeAgent(2);
  runFor(os, 200);
  assert.equal(os.social.cooldownCount, 0);
});

test('energy: decays awake, a sleeping pet refills it, old saves load with fresh energy', () => {
  assert.ok((NEED_KEYS as readonly string[]).includes('energy'));
  const old = { version: 1, savedAt: Date.now(), pets: { kit: { needs: { hunger: 50 } } } };
  const w = PetCareWorld.fromSnapshot(old, Date.now());
  assert.equal(w.entry('kit').needs.energy, PET_NEED_START, 'missing energy starts fresh');
  assert.equal(w.entry('kit').needs.hunger, 50);
  w.tick(2, 0);
  assert.ok(w.entry('kit').needs.energy < PET_NEED_START, 'decays while awake');
  Object.assign(w.entry('kit').needs, { hunger: 90, thirst: 90, affection: 90, fun: 90 });
  w.entry('kit').needs.hygiene = 90;
  w.entry('kit').needs.energy = 5;
  assert.equal(pickRequest(w.entry('kit').needs), null, 'tired raises no request bubble');

  const os = office();
  const pet = addPet(os);
  Object.assign(pet, { tileCol: 9, tileRow: 4, x: 9 * 16 + 8, y: 4 * 16 + 8, path: [] });
  os.life.rng = mulberry32(4);
  os.petCare.world.entry(pet.id).needs.energy = 10;
  runFor(os, 5);
  const nap = os.petCare.currentClaim(pet.id);
  assert.ok(nap?.sleep, 'a tired pet goes to sleep');
  assert.ok(['bed', 'house'].includes(nap!.kind), `nearest bed or house, got ${nap!.kind}`);
  runFor(os, 20);
  assert.ok(os.petCare.world.entry(pet.id).needs.energy > 40, 'sleep restored energy');
});

test('pets claim toys and beds through the reservations, and never coffee', () => {
  const os = office();
  const pet = addPet(os);
  const actor = os.life.actors.actorFor(pet).id;
  assert.ok(os.life.forcePetActivity(pet, 'yarn'));
  const key = os.petCare.currentClaim(pet.id)!.spot!.key;
  assert.equal(spots(os).holderOf(key), actor, 'reserved at walk start');
  assert.equal(os.life.forcePetActivity(pet, 'coffee'), false, 'pets never drink coffee');

  // With every other spot held, the provider still offers no coffee.
  os.life.rng = () => 0;
  const kinds = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const c = os.life.petActivities.claimIdle(pet, os.petCare.world.entry(pet.id).needs);
    if (c) kinds.add(c.kind);
  }
  assert.ok(![...kinds].includes('coffee'));
});

test('house: a cat asleep inside carries the peek (ears or tail) for the renderer', () => {
  const os = office();
  const ch = idleCat(os, 1, 'chairA');
  assert.ok(os.forceIdleActivity(1, 'house'));
  runFor(os, 15);
  assert.equal(ch.activity?.id, 'house');
  assert.equal(ch.activity?.spot?.peek?.kind, 'tail');
});

test('two cats at coffee talk in place; two on toys play together on one toy', () => {
  const os = office();
  idleCat(os, 1, 'chairA');
  idleCat(os, 2, 'chairB');
  assert.ok(os.forceIdleActivity(1, 'coffee', '5,5'));
  assert.ok(os.forceIdleActivity(2, 'coffee', '7,5'));
  runFor(os, 6);
  assert.equal(os.life.encounter(1, 2, false), 'talk');
  assert.equal(os.characters.get(1)!.state, CharacterState.ACTIVITY, 'keeps its pose');

  const os2 = office();
  place(idleCat(os2, 1, 'chairA'), 3, 6);
  const pet = addPet(os2);
  Object.assign(pet, { tileCol: 6, tileRow: 6, x: 6 * 16 + 8, y: 6 * 16 + 8, path: [] });
  os2.life.rng = mulberry32(9);
  assert.ok(os2.forceIdleActivity(1, 'yarn', '3,7'));
  assert.ok(os2.life.forcePetActivity(pet, 'mouse', '6,7'));
  runFor(os2, 2);
  const actor = os2.life.actors.actorFor(pet).id;
  assert.equal(os2.life.encounter(1, actor, true), 'toy');
  assert.equal(spots(os2).holderOf('5,7'), actor, 'the pet holds the far side of the yarn');
  runFor(os2, 4);
  assert.equal(os2.social.sceneInfo(1)?.phase, 'toy');
});
