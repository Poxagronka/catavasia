/**
 * Pet owner (owner request 2026-10-12): a pet may name an agent cat as its
 * owner. The owner persists in the layout by the stable cat id, resets to
 * none when that cat is gone, and an owned pet spends clearly more time at
 * its owner's side (a deterministic seeded run, like idlePacing.test.ts).
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeAll, beforeEach, test } from 'vitest';

import { buildFurnitureCatalog } from '../../core/src/assets/build.ts';
import { OfficeState, type ResidentCat } from '../src/office/engine/officeState.js';
import { mulberry32 } from '../src/office/engine/socialMoves.js';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.js';
import { deserializeLayout, serializeLayout } from '../src/office/layout/layoutSerializer.js';
import { setPetTemplates } from '../src/office/sprites/petSpriteData.js';
import type { OfficeLayout, SpriteData } from '../src/office/types.js';
import { CharacterState } from '../src/office/types.js';

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');
const DT = 0.05;
const SIM_MIN = 30;
const SEEDS = [11, 23, 37, 41, 59];
/** "At the owner's desk": this close (tiles) to the owner's seat. */
const NEAR_TILES = 3;
const PIXEL: SpriteData = [['']];
const FRAMES = [PIXEL, PIXEL, PIXEL];

beforeAll(() => {
  const catalog = buildFurnitureCatalog(ASSETS);
  const sprites: Record<string, SpriteData> = {};
  for (const c of catalog) {
    sprites[c.id] = c.id.includes('BOOKSHELF')
      ? Array.from({ length: c.height }, () => new Array<string>(c.width).fill('book'))
      : PIXEL;
  }
  assert.ok(buildDynamicCatalog({ catalog, sprites } as never));
  const sheet = { walkDown: FRAMES, idleDown: FRAMES, walkUp: FRAMES, idleUp: FRAMES };
  setPetTemplates([{ ...sheet, walkRight: FRAMES }], ['Gitcat'], ['cat']);
});

const realRandom = Math.random;
afterEach(() => {
  Math.random = realRandom;
});
beforeEach(() => {
  Math.random = mulberry32(1);
});

const resident = (id: number, catId: string, working = false): ResidentCat => ({
  id,
  catId,
  name: `cat ${catId}`,
  appearance: {},
  working,
});

function office(seed: number): OfficeState {
  Math.random = mulberry32(seed);
  const file = path.join(ASSETS, 'default-layout-10.json');
  const os = new OfficeState(JSON.parse(fs.readFileSync(file, 'utf-8')) as OfficeLayout);
  os.life.seed(seed);
  return os;
}

test('the owner persists in the layout and survives a save and load', () => {
  const os = office(1);
  os.addAgent(1, 0, 0, undefined, true);
  os.setResidentCats([resident(1, 'cat-a')]);
  os.addPet({ id: 'kit', petType: 0 });
  os.addPet({ id: 'tom', petType: 0 });
  os.updatePetProfile('kit', { ownerCatId: 'cat-a' });
  assert.equal(os.layout.pets?.find((p) => p.id === 'kit')?.ownerCatId, 'cat-a');
  assert.equal(os.layout.pets?.find((p) => p.id === 'tom')?.ownerCatId, undefined);

  const reloaded = deserializeLayout(serializeLayout(os.getLayout()));
  assert.ok(reloaded);
  const os2 = new OfficeState(reloaded);
  assert.equal(os2.pets.find((p) => p.id === 'kit')?.ownerCatId, 'cat-a');
  assert.equal(os2.pets.find((p) => p.id === 'tom')?.ownerCatId, undefined);
});

test('an older layout without the field loads as no owner', () => {
  const os = office(1);
  os.addPet({ id: 'kit', petType: 0 });
  assert.equal(os.pets[0].ownerCatId, undefined);
  os.addPet({ id: 'bad', petType: 0, ownerCatId: 42 as unknown as string });
  assert.equal(os.pets[1].ownerCatId, undefined);
});

test('the owner resets to none when its cat is deleted', () => {
  const os = office(1);
  os.addAgent(1, 0, 0, undefined, true);
  os.addAgent(2, 0, 0, undefined, true);
  os.setResidentCats([resident(1, 'cat-a'), resident(2, 'cat-b')]);
  os.addPet({ id: 'kit', petType: 0, ownerCatId: 'cat-a' });
  os.addPet({ id: 'tom', petType: 0, ownerCatId: 'cat-b' });
  assert.equal(os.ownerOf(os.pets[0])?.id, 1);

  os.setResidentCats([resident(2, 'cat-b')]);
  assert.equal(os.pets[0].ownerCatId, undefined);
  assert.equal(os.pets[1].ownerCatId, 'cat-b');
  assert.equal(os.layout.pets?.find((p) => p.id === 'kit')?.ownerCatId, undefined);
  assert.equal(os.layout.pets?.find((p) => p.id === 'tom')?.ownerCatId, 'cat-b');
});

/** Share of the run the pet spends within NEAR_TILES of the owner's seat. */
function nearShare(owned: boolean, seed: number): number {
  const os = office(seed);
  for (const id of [1, 2]) os.addAgent(id, 0, 0, undefined, true);
  os.setResidentCats([resident(1, 'cat-a', true), resident(2, 'cat-b', false)]);
  os.setAgentActive(2, false);
  os.characters.get(2)!.state = CharacterState.IDLE;
  os.addPet({ id: 'pet', petType: 0, ...(owned ? { ownerCatId: 'cat-a' } : {}) });
  const owner = os.characters.get(1)!;
  const seat = os.seats.get(owner.seatId!)!;
  let near = 0;
  let total = 0;
  for (let t = 0; t < SIM_MIN * 60; t += DT) {
    os.update(DT);
    const pet = os.pets[0];
    total++;
    if (Math.abs(pet.tileCol - seat.seatCol) + Math.abs(pet.tileRow - seat.seatRow) <= NEAR_TILES)
      near++;
  }
  return near / total;
}

test(
  'an owned pet spends clearly more time at its owner than an unowned pet',
  { timeout: 120_000 },
  () => {
    let owned = 0;
    let free = 0;
    for (const seed of SEEDS) {
      owned += nearShare(true, seed);
      free += nearShare(false, seed);
    }
    owned /= SEEDS.length;
    free /= SEEDS.length;
    assert.ok(owned >= free * 1.5 && owned - free >= 0.1, `owned ${owned} vs unowned ${free}`);
  },
);
