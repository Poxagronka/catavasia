/**
 * Cats menu "Pets" tab: pet cats are the pets placed in the layout. Covers
 * the runtime coats (repainted Gitcat sheets), the add / rename / recolour /
 * delete path through OfficeState + layout.pets, and the layout round trip.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { decodePetPng } from '../../core/src/assets/pngDecoder.js';
import { BREED_PRESETS, COAT_PRESETS, toHex } from '../src/cats/catArt.js';
import { addPet, deletePet, petRows } from '../src/cats/petRoster.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.js';
import { renderPetAppearance, templateRoles } from '../src/office/sprites/petAppearance.js';
import { buildCarePoses } from '../src/office/sprites/petCareFrames.js';
import {
  getPetSprites,
  getPetSpritesFor,
  type PetSpriteFrames,
  setPetTemplates,
} from '../src/office/sprites/petSpriteData.js';
import type { OfficeLayout, SpriteData } from '../src/office/types.js';
import { TileType } from '../src/office/types.js';

const PETS_DIR = path.join(__dirname, '../public/assets/pets');
const GITCAT = 0;
const CLAUDIO = 1;
const FUR = toHex([18, 52, 86]);
const EYES = toHex([0, 255, 0]);
const COLLAR = toHex([255, 0, 0]);
/** Nikolai's own collar. */
const NIKOLAI_COLLAR = toHex([232, 182, 50]);

beforeAll(() => {
  const sheet = (id: string) => decodePetPng(readFileSync(path.join(PETS_DIR, id, 'pet.png')));
  setPetTemplates([sheet('gitcat'), sheet('claudio')], ['Gitcat', 'Claudio'], ['cat', 'dog']);
  const asset = (id: string) => ({
    id,
    name: id,
    label: id,
    category: 'misc',
    file: `${id}.png`,
    width: 16,
    height: 16,
    footprintW: 1,
    footprintH: 1,
    isDesk: false,
    canPlaceOnWalls: false,
  });
  const catalog = [asset('SCRATCHING_POST'), asset('PLANT')];
  const sprites = Object.fromEntries(catalog.map((c) => [c.id, [[FUR]]]));
  expect(buildDynamicCatalog({ catalog, sprites } as never)).toBeTruthy();
});

const gitcat = () => getPetSprites(GITCAT)!;

const sheetFrames = (s: PetSpriteFrames): SpriteData[] => [
  ...s.walkDown,
  ...s.idleDown,
  ...s.walkUp,
  ...s.idleUp,
  ...s.walkRight,
];
const colours = (s: PetSpriteFrames) => new Set(sheetFrames(s).flat(2).filter(Boolean));
const mask = (s: SpriteData) => s.map((row) => row.map((px) => (px ? 1 : 0)).join('')).join('/');

function office(pets: OfficeLayout['pets'] = []): OfficeState {
  const cols = 12;
  const rows = 8;
  return new OfficeState({
    version: 1,
    cols,
    rows,
    tiles: new Array<TileType>(cols * rows).fill(TileType.FLOOR_1),
    furniture: [
      { uid: 'post', type: 'SCRATCHING_POST', col: 10, row: 6 },
      { uid: 'plant', type: 'PLANT', col: 1, row: 1 },
    ],
    pets,
  });
}

describe('pet coats (repainted Gitcat sheet)', () => {
  it('reads the roles of the Gitcat palette', () => {
    const roles = [...templateRoles(gitcat()).values()].sort();
    expect(roles).toEqual(['earIn', 'fur', 'nose', 'outline', 'shade']);
  });

  it.each([...BREED_PRESETS, ...COAT_PRESETS].map((p) => [p.name, p.appearance] as const))(
    'renders %s with the template frames and silhouette',
    (_name, appearance) => {
      const t = gitcat();
      const s = renderPetAppearance(t, appearance);
      for (const key of ['walkDown', 'idleDown', 'walkUp', 'idleUp', 'walkRight'] as const) {
        expect(s[key]).toHaveLength(t[key].length);
        s[key].forEach((f, i) => expect(mask(f)).toBe(mask(t[key][i])));
      }
      expect(s.walkLeft).toHaveLength(3);
      expect(colours(s)).not.toEqual(colours(t));
      const poses = buildCarePoses(s);
      const tPoses = buildCarePoses(t);
      for (const k of Object.keys(tPoses) as Array<keyof typeof tPoses>)
        expect(poses[k]).toHaveLength(tPoses[k].length);
    },
  );

  it('applies custom fur, eye and collar colours', () => {
    const s = renderPetAppearance(gitcat(), {
      breed: 'nikolai',
      colors: { fur: FUR },
      eyes: EYES,
      collar: COLLAR,
    });
    const c = colours(s);
    for (const hex of [FUR, EYES, COLLAR]) expect(c.has(hex.toUpperCase())).toBe(true);
    const nikolai = (collar?: 'none') =>
      colours(renderPetAppearance(gitcat(), { breed: 'nikolai', collar }));
    expect(nikolai().has(NIKOLAI_COLLAR.toUpperCase())).toBe(true);
    expect(nikolai('none').has(NIKOLAI_COLLAR.toUpperCase())).toBe(false);
  });

  it('keeps Gitcat and dogs on their own sheet unless a cat has a coat', () => {
    expect(getPetSpritesFor({ petType: GITCAT })).toBe(getPetSprites(GITCAT));
    const dog = getPetSpritesFor({ petType: CLAUDIO, appearance: { breed: 'tux' } });
    expect(dog).toBe(getPetSprites(CLAUDIO));
    const tux = getPetSpritesFor({ petType: GITCAT, appearance: { breed: 'tux' } });
    expect(tux).not.toBe(getPetSprites(GITCAT));
    // Cached: the renderer's sprite cache keys on object identity.
    expect(getPetSpritesFor({ petType: GITCAT, appearance: { breed: 'tux' } })).toBe(tux);
  });
});

describe('pets tab on the layout pets', () => {
  it('lists every pet of the layout, cats and dogs', () => {
    const os = office([
      { id: 'g', petType: GITCAT },
      { id: 'd', petType: CLAUDIO },
    ]);
    expect(petRows(os).map((r) => [r.id, r.name, r.kind])).toEqual([
      ['g', 'Gitcat', 'Gitcat'],
      ['d', 'Claudio', 'Claudio'],
    ]);
  });

  it('adds a pet dog with a name and no coat', () => {
    const os = office([{ id: 'd', petType: CLAUDIO }]);
    const id = addPet(os, 'dog', () => 0)!;
    expect(os.getLayout().pets!.find((p) => p.id === id)).toEqual({
      id,
      petType: CLAUDIO,
      name: 'Puppy',
    });
    expect(petRows(os).map((r) => r.name)).toEqual(['Claudio', 'Puppy']);
  });

  it('adds a pet cat next to pet furniture, with a name and a new coat', () => {
    const os = office([{ id: 'g', petType: GITCAT }]);
    const id = addPet(os, 'cat', () => 0)!;
    const pet = os.pets.find((p) => p.id === id)!;
    expect(Math.max(Math.abs(pet.tileCol - 10), Math.abs(pet.tileRow - 6))).toBe(1);
    const entry = os.getLayout().pets!.find((p) => p.id === id)!;
    expect(entry).toEqual({
      id,
      petType: GITCAT,
      name: 'Kitten',
      appearance: { breed: 'marmalade' },
    });
    expect(petRows(os).map((r) => r.name)).toEqual(['Gitcat', 'Kitten']);
  });

  it('renames and recolours through the layout entry', () => {
    const os = office([{ id: 'g', petType: GITCAT }]);
    os.updatePetProfile('g', { name: 'Pixel', appearance: { breed: 'mochi' } });
    expect(os.pets[0].name).toBe('Pixel');
    expect(os.getLayout().pets).toEqual([
      { id: 'g', petType: GITCAT, name: 'Pixel', appearance: { breed: 'mochi' } },
    ]);
    os.updatePetProfile('g', { name: 'Pixel', appearance: undefined });
    expect(os.getLayout().pets).toEqual([{ id: 'g', petType: GITCAT, name: 'Pixel' }]);
  });

  it('deletes the pet from the layout and forgets its pet-care needs', () => {
    const os = office([
      { id: 'g', petType: GITCAT },
      { id: 'h', petType: GITCAT },
    ]);
    os.petCare.world.entry('g');
    os.petCare.menuPetId = 'g';
    deletePet(os, 'g');
    expect(os.getLayout().pets!.map((p) => p.id)).toEqual(['h']);
    expect(os.petCare.world.pets.has('g')).toBe(false);
    expect(os.petCare.menuPetId).toBeNull();
  });

  it('survives a save and reload of the layout', () => {
    const os = office([{ id: 'g', petType: GITCAT }]);
    os.updatePetProfile('g', { name: 'Pixel', appearance: { breed: 'tux', eyes: EYES } });
    const id = addPet(os, 'cat')!;
    const saved = JSON.parse(JSON.stringify(os.getLayout())) as OfficeLayout;
    const reloaded = office(saved.pets);
    expect(reloaded.pets.map((p) => [p.id, p.name, p.appearance])).toEqual(
      os.pets.map((p) => [p.id, p.name, p.appearance]),
    );
    expect(reloaded.pets.find((p) => p.id === id)?.name).toBe('Kitten');
    // A layout reload (another window saved) renames the live pet in place.
    const pet = reloaded.pets[0];
    reloaded.rebuildFromLayout({
      ...reloaded.getLayout(),
      pets: [{ ...saved.pets![0], name: 'Renamed' }, saved.pets![1]],
    });
    expect(reloaded.pets[0]).toBe(pet);
    expect(pet.name).toBe('Renamed');
  });

  it('keeps old layouts as they are, and ignores a broken name or coat', () => {
    const os = office([
      { id: 'g', petType: GITCAT },
      { id: 'b', petType: GITCAT, name: '  ', appearance: { breed: 'nope' } },
      { id: 'd', petType: CLAUDIO, name: 'Rex', appearance: { breed: 'tux' } },
    ]);
    expect(os.getLayout().pets).toEqual([
      { id: 'g', petType: GITCAT },
      { id: 'b', petType: GITCAT },
      { id: 'd', petType: CLAUDIO, name: 'Rex' },
    ]);
    expect(os.pets.map((p) => p.name)).toEqual(['Gitcat', 'Gitcat', 'Rex']);
  });
});
