/**
 * Pure movement helpers for cat social scenes: who faces whom, where a cat
 * stands to talk, where it runs in a chase, and where it flees after a fight.
 * DOM-free and RNG-injected so scenes stay reproducible in tests.
 */
import { findPath, isWalkable } from '../layout/tileMap.js';
import type { Character, TileType as TileTypeVal } from '../types.js';
import { CharacterState, Direction } from '../types.js';

export interface Tile {
  col: number;
  row: number;
}

/** The slice of OfficeState a social scene needs to move cats. */
export interface SocialWorld {
  walkableTiles: Tile[];
  tileMap: TileTypeVal[][];
  blockedTiles: Set<string>;
}

/** Chebyshev distance in tiles. */
export function tileDistance(a: Tile, b: Tile): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

export function tileOf(ch: Character): Tile {
  return { col: ch.tileCol, row: ch.tileRow };
}

/** Turn two cats toward each other (horizontal wins a tie). */
export function faceEachOther(a: Character, b: Character): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const right = dx >= 0;
    a.dir = right ? Direction.RIGHT : Direction.LEFT;
    b.dir = right ? Direction.LEFT : Direction.RIGHT;
  } else {
    const down = dy > 0;
    a.dir = down ? Direction.DOWN : Direction.UP;
    b.dir = down ? Direction.UP : Direction.DOWN;
  }
}

/** Stop after the current step: no snap back to the tile centre mid-stride. */
export function stopAfterStep(ch: Character): void {
  ch.path = ch.path.slice(0, 1);
}

/**
 * Walk a cat to a tile. A cat mid-stride finishes its step first, so a
 * re-path never snaps it back. Returns false when there is no path.
 */
export function walkTo(ch: Character, to: Tile, world: SocialWorld): boolean {
  const next = ch.moveProgress > 0 && ch.path.length > 0 ? ch.path[0] : null;
  const from = next ?? tileOf(ch);
  const path = findPath(from.col, from.row, to.col, to.row, world.tileMap, world.blockedTiles);
  if (next) {
    ch.path = [next, ...path];
    return true;
  }
  if (path.length === 0) return false;
  ch.path = path;
  ch.moveProgress = 0;
  if (ch.state !== CharacterState.WALK) {
    ch.state = CharacterState.WALK;
    ch.frame = 0;
    ch.frameTimer = 0;
  }
  return true;
}

/**
 * A free tile next to `host` for `guest` to talk from: left/right first (the
 * side view reads best), then above/below, nearest to the guest. Null when
 * the guest already stands next to the host or no side is free.
 */
export function meetTile(
  guest: Character,
  host: Character,
  world: SocialWorld,
  occupied: Set<string>,
): Tile | null {
  // Only a left / right neighbour counts: a cat directly above another
  // overlaps it (sprites are two tiles tall).
  const sideBySide = guest.tileRow === host.tileRow && Math.abs(guest.tileCol - host.tileCol) === 1;
  if (sideBySide) return null;
  const sides: Tile[] = [
    { col: host.tileCol - 1, row: host.tileRow },
    { col: host.tileCol + 1, row: host.tileRow },
    { col: host.tileCol, row: host.tileRow - 1 },
    { col: host.tileCol, row: host.tileRow + 1 },
  ];
  const isFree = (t: Tile) =>
    isWalkable(t.col, t.row, world.tileMap, world.blockedTiles) &&
    !occupied.has(`${t.col},${t.row}`);
  // Prefer horizontal sides: vertical ones only when both horizontal are taken.
  let free = sides.slice(0, 2).filter(isFree);
  if (free.length === 0) free = sides.slice(2).filter(isFree);
  if (free.length === 0) return null;
  const g = tileOf(guest);
  free.sort((p, q) => tileDistance(p, g) - tileDistance(q, g));
  return free[0];
}

/**
 * Tiles for a head-to-tail standoff: [top, bottom] on adjacent rows, the
 * same column first (bodies overlap), then a neighbouring one. Searched
 * within `radius` of the pair's midpoint; the pair is assigned to [a, b] by
 * the shorter total walk. Null when no free pair of tiles exists.
 */
export function standoffTiles(
  a: Character,
  b: Character,
  world: SocialWorld,
  occupied: Set<string>,
  radius: number,
): [Tile, Tile] | null {
  const ta = tileOf(a);
  const tb = tileOf(b);
  const own = new Set([`${ta.col},${ta.row}`, `${tb.col},${tb.row}`]);
  const isFree = (t: Tile) =>
    isWalkable(t.col, t.row, world.tileMap, world.blockedTiles) &&
    (own.has(`${t.col},${t.row}`) || !occupied.has(`${t.col},${t.row}`));
  const mid = { col: Math.round((ta.col + tb.col) / 2), row: Math.round((ta.row + tb.row) / 2) };
  let best: [Tile, Tile] | null = null;
  let bestCost = Infinity;
  for (let dr = -radius; dr <= radius; dr++)
    for (let dc = -radius; dc <= radius; dc++) {
      const top = { col: mid.col + dc, row: mid.row + dr };
      if (!isFree(top)) continue;
      for (const shift of [0, -1, 1]) {
        const bottom = { col: top.col + shift, row: top.row + 1 };
        if (!isFree(bottom)) continue;
        const straight = tileDistance(ta, top) + tileDistance(tb, bottom);
        const swapped = tileDistance(ta, bottom) + tileDistance(tb, top);
        // A neighbouring column costs one extra step: same column wins a tie.
        const cost = Math.min(straight, swapped) + Math.abs(shift);
        if (cost >= bestCost) continue;
        bestCost = cost;
        best = straight <= swapped ? [top, bottom] : [bottom, top];
      }
    }
  return best;
}

/**
 * A walkable tile `minDist..maxDist` tiles from `from`, at most `roam` tiles
 * from `home`, and away from `away` (the other cat). Falls back to any tile
 * in range.
 */
export function tileAwayFrom(
  from: Tile,
  away: Tile,
  minDist: number,
  maxDist: number,
  home: Tile,
  roam: number,
  world: SocialWorld,
  rng: () => number,
): Tile | null {
  const dx = from.col - away.col;
  const dy = from.row - away.row;
  const inRange = world.walkableTiles.filter((t) => {
    const d = tileDistance(t, from);
    return d >= minDist && d <= maxDist && tileDistance(t, home) <= roam;
  });
  const ahead = inRange.filter((t) => (t.col - from.col) * dx + (t.row - from.row) * dy > 0);
  const pool = ahead.length > 0 ? ahead : inRange;
  if (pool.length === 0) return null;
  return pool[Math.floor(rng() * pool.length)];
}

/** The tile farthest from `other` among a random handful, for running apart. */
export function fleeTile(
  self: Tile,
  other: Tile,
  minDist: number,
  world: SocialWorld,
  rng: () => number,
): Tile | null {
  const dx = self.col - other.col;
  const dy = self.row - other.row;
  // Same tile: pick a side at random so the two cats split left / right.
  const dirX = dx === 0 && dy === 0 ? (rng() < 0.5 ? -1 : 1) : dx;
  const candidates = world.walkableTiles.filter(
    (t) =>
      tileDistance(t, other) >= minDist && (t.col - self.col) * dirX + (t.row - self.row) * dy > 0,
  );
  if (candidates.length === 0) return null;
  candidates.sort((p, q) => tileDistance(q, other) - tileDistance(p, other));
  const top = candidates.slice(0, Math.max(1, Math.ceil(candidates.length / 4)));
  return top[Math.floor(rng() * top.length)];
}

/** Deterministic PRNG (mulberry32) for reproducible scenes and tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
