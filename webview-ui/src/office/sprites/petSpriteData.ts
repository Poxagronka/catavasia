import type { Appearance } from '../../cats/catsApi.js';
import type { SpriteData } from '../types.js';
import { renderPetAppearance } from './petAppearance.js';

/**
 * Resolved per-pet sprite frames. Each entry is a 3-frame animation array.
 * `walkLeft` / `idleRight` / `idleLeft` are derived in setPetTemplates from
 * the broadcast fields.
 */
export interface PetSpriteFrames {
  walkDown: [SpriteData, SpriteData, SpriteData];
  idleDown: [SpriteData, SpriteData, SpriteData];
  walkUp: [SpriteData, SpriteData, SpriteData];
  idleUp: [SpriteData, SpriteData, SpriteData];
  walkRight: [SpriteData, SpriteData, SpriteData];
  walkLeft: [SpriteData, SpriteData, SpriteData];
  idleRight: [SpriteData, SpriteData, SpriteData];
  idleLeft: [SpriteData, SpriteData, SpriteData];
}

/** Flip a sprite horizontally (used for walkRight → walkLeft). */
function flipHorizontal(s: SpriteData): SpriteData {
  return s.map((row) => [...row].reverse());
}

/** Coerce a 3-frame raw array to a fixed-length tuple. Caller must verify len ≥ 3 first. */
function toTriple(arr: string[][][]): [SpriteData, SpriteData, SpriteData] {
  return [arr[0], arr[1], arr[2]];
}

let loadedPets: PetSpriteFrames[] | null = null;
let loadedPetNames: string[] = [];
let loadedPetSpecies: string[] = [];

/**
 * Receive raw frame arrays + parallel display names from the server message.
 * Skips entries with fewer than 3 frames in any of the required directions.
 */
export function setPetTemplates(
  data: Array<{
    walkDown: string[][][];
    idleDown: string[][][];
    walkUp: string[][][];
    idleUp: string[][][];
    walkRight: string[][][];
  }>,
  petNames?: string[],
  petSpecies?: string[],
): void {
  const resolved: PetSpriteFrames[] = [];
  const resolvedNames: string[] = [];
  const resolvedSpecies: string[] = [];
  for (let i = 0; i < data.length; i++) {
    const raw = data[i];
    if (
      !raw ||
      !raw.walkDown ||
      raw.walkDown.length < 3 ||
      !raw.idleDown ||
      raw.idleDown.length < 3 ||
      !raw.walkUp ||
      raw.walkUp.length < 3 ||
      !raw.idleUp ||
      raw.idleUp.length < 3 ||
      !raw.walkRight ||
      raw.walkRight.length < 3
    ) {
      continue;
    }
    const walkDown = toTriple(raw.walkDown);
    const idleDown = toTriple(raw.idleDown);
    const walkUp = toTriple(raw.walkUp);
    const idleUp = toTriple(raw.idleUp);
    const walkRight = toTriple(raw.walkRight);
    const walkLeft: [SpriteData, SpriteData, SpriteData] = [
      flipHorizontal(walkRight[0]),
      flipHorizontal(walkRight[1]),
      flipHorizontal(walkRight[2]),
    ];
    // The pet's front-facing idle stands in for "idle right"; the back-facing
    // idle stands in for "idle left". No flip — the side-on pose isn't authored.
    resolved.push({
      walkDown,
      idleDown,
      walkUp,
      idleUp,
      walkRight,
      walkLeft,
      idleRight: idleDown,
      idleLeft: idleUp,
    });
    resolvedNames.push(petNames?.[i] ?? `Pet ${i + 1}`);
    resolvedSpecies.push(petSpecies?.[i] ?? '');
  }
  loadedPets = resolved;
  coatCache.clear();
  loadedPetNames = resolvedNames;
  loadedPetSpecies = resolvedSpecies;
}

/** Returns the resolved frames for a petType, or null if not loaded or out of range. */
export function getPetSprites(petIndex: number): PetSpriteFrames | null {
  if (!loadedPets) return null;
  if (petIndex < 0 || petIndex >= loadedPets.length) return null;
  return loadedPets[petIndex];
}

/** Repainted sheets by petType + appearance. Stable objects: the sprite caches key on identity. */
const coatCache = new Map<string, PetSpriteFrames>();
const COAT_CACHE_LIMIT = 64;

/**
 * The frames a pet draws with: its template sheet, repainted when a cat pet
 * has an appearance. Dogs and coat-less cats (Gitcat as shipped) get the
 * template unchanged.
 */
export function getPetSpritesFor(pet: {
  petType: number;
  appearance?: Appearance;
}): PetSpriteFrames | null {
  const template = getPetSprites(pet.petType);
  if (!template || !pet.appearance || !isCatPet(pet.petType)) return template;
  const key = `${pet.petType}|${JSON.stringify(pet.appearance)}`;
  let frames = coatCache.get(key);
  if (!frames) {
    frames = renderPetAppearance(template, pet.appearance);
    if (coatCache.size >= COAT_CACHE_LIMIT) coatCache.delete(coatCache.keys().next().value!);
    coatCache.set(key, frames);
  }
  return frames;
}

/** Number of pets currently loaded. */
export function getPetCount(): number {
  return loadedPets?.length ?? 0;
}

/** Display name for a petType. Falls back to "Pet N" when manifest missing. */
export function getPetName(petIndex: number): string {
  return loadedPetNames[petIndex] ?? `Pet ${petIndex + 1}`;
}

/** True when the pet's manifest says `"species": "cat"` — cats get the pet-care needs. */
export function isCatPet(petIndex: number): boolean {
  return loadedPetSpecies[petIndex] === 'cat';
}
