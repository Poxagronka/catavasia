import { ZOOMIES_MAX_TILES, ZOOMIES_MIN_TILES, ZOOMIES_PICKS } from '../../constants.js';
import { furnitureKind } from '../layout/furnitureCatalog.js';
import { findPath, isWalkable } from '../layout/tileMap.js';
import type { Pet, PlacedFurniture, TileType as TileTypeVal } from '../types.js';
import { Direction, TILE_SIZE } from '../types.js';
import { isLitterBoxType } from './litterStages.js';
import type { PetCareWorld } from './petCareWorld.js';

/** Furniture types the pet-care system works with (litter boxes: isLitterBoxType). */
export const PET_BOWL_TYPE = 'PET_BOWL';

/** What OfficeState hands the pet-care system each frame. */
export interface PetCareEnv {
  pets: Pet[];
  furniture: PlacedFurniture[];
  tileMap: TileTypeVal[][];
  blockedTiles: Set<string>;
  isCat: (pet: Pet) => boolean;
  /** The pet's stand-in is in a social scene: no decisions, the scene moves it. */
  inScene?: (pet: Pet) => boolean;
}

export interface CareTarget {
  uid: string;
  col: number;
  row: number;
  /** Path from the pet; empty when the pet already stands there. */
  path: Array<{ col: number; row: number }>;
}

/**
 * Path to (col, row); null when unreachable. Empty path = already there.
 * `onFurniture`: the target is a blocked furniture tile (a bed, a sofa seat)
 * the cat may step onto as the last step.
 */
export function pathTo(
  pet: Pet,
  col: number,
  row: number,
  env: PetCareEnv,
  onFurniture = false,
): Array<{ col: number; row: number }> | null {
  if (pet.tileCol === col && pet.tileRow === row) return [];
  let blocked = env.blockedTiles;
  if (onFurniture) {
    blocked = new Set(blocked);
    blocked.delete(`${col},${row}`);
  }
  const path = findPath(pet.tileCol, pet.tileRow, col, row, env.tileMap, blocked);
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
  canUse: (key: string) => boolean = () => true,
): CareTarget | null {
  let best: CareTarget | null = null;
  for (const f of env.furniture) {
    if (furnitureKind(f.type) !== PET_BOWL_TYPE) continue;
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
      if (!canUse(`${col},${row}`)) continue;
      const path = pathTo(pet, col, row, env);
      if (path && (!best || path.length < best.path.length)) best = { uid: f.uid, col, row, path };
    }
  }
  return best;
}

/**
 * The nearest reachable litter box (its tile is walkable), whatever its fill:
 * the cat finds out at the box that it overflows, and refuses it there.
 * `refused`: boxes this cat already turned down this time (skipped while they still overflow).
 */
export function findLitterBox(
  pet: Pet,
  env: PetCareEnv,
  world: PetCareWorld,
  canUse: (key: string) => boolean = () => true,
  refused: ReadonlySet<string> = new Set(),
): CareTarget | null {
  let best: CareTarget | null = null;
  for (const f of env.furniture) {
    // A refused box counts again once someone cleaned it.
    if (!isLitterBoxType(f.type) || (refused.has(f.uid) && world.isBoxRefused(f.uid))) continue;
    if (!canUse(`${f.col},${f.row}`)) continue;
    const path = pathTo(pet, f.col, f.row, env);
    if (path && (!best || path.length < best.path.length)) {
      best = { uid: f.uid, col: f.col, row: f.row, path };
    }
  }
  return best;
}

/**
 * The nearest floor tile for an accident (every box refused): walkable, not
 * a litter box, no poop there yet, within two tiles of (col, row).
 */
export function floorSpotNear(
  col: number,
  row: number,
  env: Pick<PetCareEnv, 'furniture' | 'tileMap' | 'blockedTiles'>,
  world: PetCareWorld,
  canUse: (key: string) => boolean = () => true,
): { col: number; row: number } | null {
  const boxes = new Set(
    env.furniture.filter((f) => isLitterBoxType(f.type)).map((f) => `${f.col},${f.row}`),
  );
  const poops = new Set(world.floorPoops.map((p) => `${p.col},${p.row}`));
  const tiles: Array<{ col: number; row: number; d: number }> = [];
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const c = col + dc;
      const r = row + dr;
      const key = `${c},${r}`;
      if (boxes.has(key) || poops.has(key) || !canUse(key)) continue;
      if (!isWalkable(c, r, env.tileMap, env.blockedTiles)) continue;
      tiles.push({ col: c, row: r, d: Math.abs(dc) + Math.abs(dr) });
    }
  }
  tiles.sort((a, b) => a.d - b.d);
  return tiles[0] ? { col: tiles[0].col, row: tiles[0].row } : null;
}

/**
 * A random reachable floor tile ZOOMIES_MIN..MAX_TILES away (manhattan) for a
 * zoomies dash, with its path; not a litter box tile, and `canUse` it.
 */
export function zoomiesTarget(
  col: number,
  row: number,
  env: Pick<PetCareEnv, 'furniture' | 'tileMap' | 'blockedTiles'>,
  rand: () => number = Math.random,
  canUse: (key: string) => boolean = () => true,
): { col: number; row: number; path: Array<{ col: number; row: number }> } | null {
  const boxes = new Set(
    env.furniture.filter((f) => isLitterBoxType(f.type)).map((f) => `${f.col},${f.row}`),
  );
  const out: Array<{ col: number; row: number }> = [];
  for (let dr = -ZOOMIES_MAX_TILES; dr <= ZOOMIES_MAX_TILES; dr++) {
    for (let dc = -ZOOMIES_MAX_TILES; dc <= ZOOMIES_MAX_TILES; dc++) {
      const d = Math.abs(dc) + Math.abs(dr);
      const key = `${col + dc},${row + dr}`;
      if (d < ZOOMIES_MIN_TILES || d > ZOOMIES_MAX_TILES || boxes.has(key) || !canUse(key))
        continue;
      if (isWalkable(col + dc, row + dr, env.tileMap, env.blockedTiles)) {
        out.push({ col: col + dc, row: row + dr });
      }
    }
  }
  // Many tiles that near are behind a wall: try random picks until one is reachable.
  for (let i = 0; i < ZOOMIES_PICKS && out.length > 0; i++) {
    const [t] = out.splice(Math.floor(rand() * out.length), 1);
    const path = findPath(col, row, t.col, t.row, env.tileMap, env.blockedTiles);
    if (path.length > 0) return { ...t, path };
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
    furniture.find((f) => f.col === col && f.row === row && furnitureKind(f.type) === type);
  const item =
    at(PET_BOWL_TYPE) ??
    furniture.find((f) => f.col === col && f.row === row && isLitterBoxType(f.type));
  if (!item) return null;
  return { kind: furnitureKind(item.type) === PET_BOWL_TYPE ? 'bowl' : 'box', item };
}

export function faceTowards(pet: Pet, col: number, row: number): Direction {
  if (col > pet.tileCol) return Direction.RIGHT;
  if (col < pet.tileCol) return Direction.LEFT;
  return row > pet.tileRow ? Direction.DOWN : Direction.UP;
}
