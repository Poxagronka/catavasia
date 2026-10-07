/**
 * Where a floor accident lands (every box refused): a random free floor
 * tile anywhere the cat can reach, spread over the rooms instead of
 * heaped by the box. The cat walks there, then poops.
 */
import { POOP_SPACING_TILES } from '../../constants.js';
import { getCatalogEntry } from '../layout/furnitureCatalog.js';
import { isWalkable } from '../layout/tileMap.js';
import type { PlacedFurniture, TileType as TileTypeVal } from '../types.js';
import { TileType } from '../types.js';
import { isLitterBoxType } from './litterStages.js';
import type { PetCareEnv } from './petCareNav.js';
import type { PetCareWorld } from './petCareWorld.js';

type Env = Pick<PetCareEnv, 'furniture' | 'tileMap' | 'blockedTiles'>;
type Tile = { col: number; row: number };

const STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * A random floor tile for an accident, reachable from (col, row): walkable,
 * under no furniture (walk-through rows included), not a doorway or a
 * one-tile corridor, no poop there, and `canUse` it. Tiles at least
 * POOP_SPACING_TILES from every box and poop come first. A room (connected
 * tiles of one floor type) is picked first, weighted 1 / (1 + its poops),
 * then a tile in it, so piles spread over the office.
 */
export function floorPoopSpot(
  col: number,
  row: number,
  env: Env,
  world: PetCareWorld,
  rand: () => number = Math.random,
  canUse: (key: string) => boolean = () => true,
): Tile | null {
  const walk = (c: number, r: number) => isWalkable(c, r, env.tileMap, env.blockedTiles);
  const covered = furnitureTiles(env.furniture);
  const poops = world.floorPoops;
  const marks: Tile[] = [...poops, ...env.furniture.filter((f) => isLitterBoxType(f.type))];
  const spaced = (t: Tile) =>
    marks.every(
      (m) => Math.max(Math.abs(m.col - t.col), Math.abs(m.row - t.row)) >= POOP_SPACING_TILES,
    );
  const doorway = (t: Tile) =>
    (!walk(t.col - 1, t.row) && !walk(t.col + 1, t.row)) ||
    (!walk(t.col, t.row - 1) && !walk(t.col, t.row + 1));
  const taken = new Set(poops.map((p) => `${p.col},${p.row}`));
  const free = reachable(col, row, walk).filter((t) => {
    const key = `${t.col},${t.row}`;
    return !covered.has(key) && !taken.has(key) && !doorway(t) && canUse(key);
  });
  const best = free.filter(spaced);
  const pool = best.length > 0 ? best : free;
  if (pool.length === 0) return null;

  const roomOf = rooms(env.tileMap);
  const byRoom = new Map<number, Tile[]>();
  for (const t of pool) {
    const id = roomOf[t.row][t.col];
    byRoom.set(id, [...(byRoom.get(id) ?? []), t]);
  }
  const piles = new Map<number, number>();
  for (const p of poops) {
    const id = roomOf[p.row]?.[p.col];
    if (id !== undefined) piles.set(id, (piles.get(id) ?? 0) + 1);
  }
  const options = [...byRoom].map(([id, tiles]) => ({ tiles, w: 1 / (1 + (piles.get(id) ?? 0)) }));
  let roll = rand() * options.reduce((s, o) => s + o.w, 0);
  const room = options.find((o) => (roll -= o.w) < 0) ?? options[options.length - 1];
  return room.tiles[Math.floor(rand() * room.tiles.length)];
}

/** Every tile a placed item covers, its walk-through background rows too. */
function furnitureTiles(furniture: PlacedFurniture[]): Set<string> {
  const out = new Set<string>();
  for (const f of furniture) {
    const e = getCatalogEntry(f.type);
    for (let dr = 0; dr < (e?.footprintH ?? 1); dr++)
      for (let dc = 0; dc < (e?.footprintW ?? 1); dc++) out.add(`${f.col + dc},${f.row + dr}`);
  }
  return out;
}

/** Walkable tiles reachable from (col, row), the start included. */
function reachable(col: number, row: number, walk: (c: number, r: number) => boolean): Tile[] {
  const seen = new Set([`${col},${row}`]);
  const out: Tile[] = [{ col, row }];
  for (let i = 0; i < out.length; i++) {
    for (const [dc, dr] of STEPS) {
      const t = { col: out[i].col + dc, row: out[i].row + dr };
      const key = `${t.col},${t.row}`;
      if (seen.has(key) || !walk(t.col, t.row)) continue;
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}

/** Room id per tile: connected tiles of one floor type share an id (-1: wall or void). */
function rooms(tileMap: TileTypeVal[][]): number[][] {
  const id = tileMap.map((r) => r.map(() => -1));
  let next = 0;
  for (let r = 0; r < tileMap.length; r++) {
    for (let c = 0; c < tileMap[r].length; c++) {
      const type = tileMap[r][c];
      if (id[r][c] >= 0 || type === TileType.WALL || type === TileType.VOID) continue;
      const stack: Tile[] = [{ col: c, row: r }];
      id[r][c] = next;
      while (stack.length > 0) {
        const t = stack.pop()!;
        for (const [dc, dr] of STEPS) {
          const nc = t.col + dc;
          const nr = t.row + dr;
          if (tileMap[nr]?.[nc] !== type || id[nr][nc] >= 0) continue;
          id[nr][nc] = next;
          stack.push({ col: nc, row: nr });
        }
      }
      next++;
    }
  }
  return id;
}
