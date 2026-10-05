import { findPath, isWalkable } from '../layout/tileMap.js';
import type { Pet, PlacedFurniture, TileType as TileTypeVal } from '../types.js';
import { Direction, TILE_SIZE } from '../types.js';
import type { PetCareWorld } from './petCareWorld.js';

/** Furniture types the pet-care system works with. */
export const PET_BOWL_TYPE = 'PET_BOWL';
export const LITTER_BOX_TYPE = 'LITTER_BOX';

/** What OfficeState hands the pet-care system each frame. */
export interface PetCareEnv {
  pets: Pet[];
  furniture: PlacedFurniture[];
  tileMap: TileTypeVal[][];
  blockedTiles: Set<string>;
  isCat: (pet: Pet) => boolean;
}

export interface CareTarget {
  uid: string;
  col: number;
  row: number;
  /** Path from the pet; empty when the pet already stands there. */
  path: Array<{ col: number; row: number }>;
}

/** Path to (col, row); null when unreachable. Empty path = already there. */
export function pathTo(
  pet: Pet,
  col: number,
  row: number,
  env: PetCareEnv,
): Array<{ col: number; row: number }> | null {
  if (pet.tileCol === col && pet.tileRow === row) return [];
  const path = findPath(pet.tileCol, pet.tileRow, col, row, env.tileMap, env.blockedTiles);
  return path.length > 0 ? path : null;
}

/**
 * The closest free tile beside a bowl that still holds what the cat wants.
 * Side tiles come first: the cat then eats in profile, which reads best.
 */
export function findBowlSpot(
  pet: Pet,
  goal: 'eat' | 'drink',
  env: PetCareEnv,
  world: PetCareWorld,
): CareTarget | null {
  let best: CareTarget | null = null;
  for (const f of env.furniture) {
    if (f.type !== PET_BOWL_TYPE) continue;
    const b = world.bowl(f.uid);
    if ((goal === 'eat' ? b.food : b.water) <= 0) continue;
    for (const [dc, dr] of [
      [-1, 0],
      [1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const col = f.col + dc;
      const row = f.row + dr;
      if (!isWalkable(col, row, env.tileMap, env.blockedTiles)) continue;
      const path = pathTo(pet, col, row, env);
      if (path && (!best || path.length < best.path.length)) best = { uid: f.uid, col, row, path };
    }
  }
  return best;
}

/** The first reachable litter box with room (its tile is walkable). */
export function findLitterBox(pet: Pet, env: PetCareEnv, world: PetCareWorld): CareTarget | null {
  for (const f of env.furniture) {
    if (f.type !== LITTER_BOX_TYPE || world.isBoxFull(f.uid)) continue;
    const path = pathTo(pet, f.col, f.row, env);
    if (path) return { uid: f.uid, col: f.col, row: f.row, path };
  }
  return null;
}

export type CareHit =
  { kind: 'bowl' | 'box'; item: PlacedFurniture } | { kind: 'poop'; id: string };

/** What a click at a world point lands on: a floor poop, a bowl or a litter box. */
export function hitTestCare(
  worldX: number,
  worldY: number,
  furniture: PlacedFurniture[],
  world: PetCareWorld,
): CareHit | null {
  const col = Math.floor(worldX / TILE_SIZE);
  const row = Math.floor(worldY / TILE_SIZE);
  const poop = world.floorPoops.find((p) => p.col === col && p.row === row);
  if (poop) return { kind: 'poop', id: poop.id };
  // A bowl may stand on a (walkable) litter box tile: the bowl wins the click.
  const at = (type: string) =>
    furniture.find((f) => f.col === col && f.row === row && f.type === type);
  const item = at(PET_BOWL_TYPE) ?? at(LITTER_BOX_TYPE);
  if (!item) return null;
  return { kind: item.type === PET_BOWL_TYPE ? 'bowl' : 'box', item };
}

export function faceTowards(pet: Pet, col: number, row: number): Direction {
  if (col > pet.tileCol) return Direction.RIGHT;
  if (col < pet.tileCol) return Direction.LEFT;
  return row > pet.tileRow ? Direction.DOWN : Direction.UP;
}
