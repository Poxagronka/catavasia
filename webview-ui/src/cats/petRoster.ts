// The Cats menu "Pets" tab works on the pets placed in the office layout
// (the same `layout.pets` entries Layout > Pets toggles). Each change goes to
// the live OfficeState first, so the game shows it at once; the caller then
// saves the layout (see useEditorActions.commitPets).

import type { OfficeState } from '../office/engine/officeState.js';
import { getPetCount, getPetName, isCatPet } from '../office/sprites/petSpriteData.js';
import { BREED_PRESETS } from './catArt.js';
import type { Appearance } from './catsApi.js';

export interface PetRow {
  id: string;
  petType: number;
  name: string;
  /** The manifest name of its sprite sheet ("Gitcat"). */
  kind: string;
  appearance?: Appearance;
}

/** Cat pets in the office, in layout order. Dogs stay in Layout > Pets. */
export function petRows(os: OfficeState): PetRow[] {
  return os.pets
    .filter((p) => isCatPet(p.petType))
    .map((p) => ({
      id: p.id,
      petType: p.petType,
      name: p.name,
      kind: getPetName(p.petType),
      appearance: p.appearance,
    }));
}

/** Non-cat pets placed (shown as a hint only). */
export function otherPetNames(os: OfficeState): string[] {
  return os.pets.filter((p) => !isCatPet(p.petType)).map((p) => p.name);
}

/** The cat sheet new pets use: Gitcat when loaded, else the first cat. */
export function catTemplateType(): number | null {
  let first: number | null = null;
  for (let i = 0; i < getPetCount(); i++) {
    if (!isCatPet(i)) continue;
    if (getPetName(i) === 'Gitcat') return i;
    first ??= i;
  }
  return first;
}

/** Furniture pets use: new pets appear next to it (the lounge / playroom). */
const PET_FURNITURE = /PET|LITTER|SCRATCH|CAT_|YARN|TOY|TUNNEL|CUSHION|BED|HOUSE/;

/** A free walkable tile closest to pet furniture; a random free tile when there is none. */
export function petSpawnTile(
  os: OfficeState,
  rng: () => number = Math.random,
): { col: number; row: number } | null {
  const taken = new Set<string>();
  for (const ch of os.characters.values()) taken.add(`${ch.tileCol},${ch.tileRow}`);
  for (const p of os.pets) taken.add(`${p.tileCol},${p.tileRow}`);
  const free = os.walkableTiles.filter((t) => !taken.has(`${t.col},${t.row}`));
  const tiles = free.length > 0 ? free : os.walkableTiles;
  if (tiles.length === 0) return null;
  const anchors = os.layout.furniture.filter((f) => PET_FURNITURE.test(f.type));
  if (anchors.length === 0) return tiles[Math.floor(rng() * tiles.length)];
  const dist = (t: { col: number; row: number }) =>
    Math.min(...anchors.map((f) => Math.max(Math.abs(f.col - t.col), Math.abs(f.row - t.row))));
  const best = Math.min(...tiles.map(dist));
  const near = tiles.filter((t) => dist(t) === best);
  return near[Math.floor(rng() * near.length)];
}

/** First breed no placed pet wears yet, so a new pet looks new. */
export function freshAppearance(rows: PetRow[]): Appearance {
  const worn = new Set(rows.map((r) => r.appearance?.breed));
  const preset = BREED_PRESETS.find((p) => !worn.has(p.id)) ?? BREED_PRESETS[0];
  return { ...preset.appearance };
}

/** "Name", or "Name 2", "Name 3"... when taken. */
export function freeName(name: string, taken: string[]): string {
  if (!taken.includes(name)) return name;
  for (let n = 2; ; n++) if (!taken.includes(`${name} ${n}`)) return `${name} ${n}`;
}

/** Place a new pet cat. Returns its id, or null when no cat sheet or no floor exists. */
export function addPetCat(os: OfficeState, rng: () => number = Math.random): string | null {
  const petType = catTemplateType();
  const spawn = petSpawnTile(os, rng);
  if (petType === null || !spawn) return null;
  const rows = petRows(os);
  const id = crypto.randomUUID();
  os.addPet(
    {
      id,
      petType,
      name: freeName(
        'Kitten',
        rows.map((r) => r.name),
      ),
      appearance: freshAppearance(rows),
    },
    spawn,
  );
  return os.pets.some((p) => p.id === id) ? id : null;
}

/** Remove the pet from the layout and drop its pet-care needs. */
export function deletePet(os: OfficeState, id: string): void {
  os.removePet(id);
  os.petCare.forget(id);
}
