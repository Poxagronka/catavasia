/**
 * The Intro greeter's walk to the furniture a tour step talks about. The
 * greeter runs no wander FSM (see OfficeState.greeter), so this is the whole
 * of its movement: plan a path next to an item, step along it, stop facing it.
 *
 * The greeter stands to the RIGHT of and below the item: the speech bubble
 * opens up-right of the greeter's head, so this keeps the item it talks about
 * visible on the bubble's left.
 */

import { WALK_FRAME_DURATION_SEC } from '../../constants.js';
import { furnitureKind, getCatalogEntry } from '../layout/furnitureCatalog.js';
import type { Character, PlacedFurniture } from '../types.js';
import { CharacterState, Direction, TILE_SIZE } from '../types.js';
import { stepAlongPath } from './characters.js';

type Tile = { col: number; row: number };

export interface GreeterVisitPlan {
  path: Tile[];
  /** Where the greeter looks once it arrives: at the item. */
  face: Direction;
}

/**
 * Plan a walk from `from` to a tile next to the first item of `kinds` the
 * office has (kinds in order of preference). Null when no such item exists or
 * no tile next to it can be reached: the caller keeps the greeter in place.
 */
export function planGreeterVisit(
  from: Tile,
  kinds: readonly string[],
  furniture: readonly PlacedFurniture[],
  walkableTiles: readonly Tile[],
  pathTo: (to: Tile) => Tile[],
): GreeterVisitPlan | null {
  const item = kinds
    .map((kind) => furniture.find((f) => furnitureKind(f.type) === kind))
    .find((f) => f !== undefined);
  if (!item) return null;
  const entry = getCatalogEntry(item.type);
  const w = entry?.footprintW ?? 1;
  const h = entry?.footprintH ?? 1;
  // Aim at the tile diagonally right-below the footprint, then take the
  // closest walkable tile the greeter can reach.
  const aim = { col: item.col + w, row: item.row + h };
  const byDistance = [...walkableTiles].sort(
    (a, b) => manhattan(a, aim) - manhattan(b, aim) || a.row - b.row || a.col - b.col,
  );
  // A few nearest tiles are enough: past them the item is cut off anyway.
  for (const tile of byDistance.slice(0, 12)) {
    const path = tile.col === from.col && tile.row === from.row ? [] : pathTo(tile);
    if (path.length === 0 && (tile.col !== from.col || tile.row !== from.row)) continue;
    return { path, face: faceToward(tile, item, w) };
  }
  return null;
}

/** Start walking a planned path (an empty path just turns to face the item). */
export function startGreeterWalk(ch: Character, plan: GreeterVisitPlan): void {
  // Restart from the tile center: a step change mid-stride replans from here.
  ch.x = ch.tileCol * TILE_SIZE + TILE_SIZE / 2;
  ch.y = ch.tileRow * TILE_SIZE + TILE_SIZE / 2;
  ch.path = plan.path;
  ch.moveProgress = 0;
  ch.frame = 0;
  ch.frameTimer = 0;
  if (plan.path.length === 0) {
    ch.state = CharacterState.IDLE;
    ch.dir = plan.face;
  } else {
    ch.state = CharacterState.WALK;
  }
}

/** Advance a walking greeter one frame; on arrival it stands facing `face`. */
export function advanceGreeterWalk(ch: Character, dt: number, face: Direction): void {
  if (ch.state !== CharacterState.WALK) return;
  if (ch.path.length === 0) {
    ch.state = CharacterState.IDLE;
    ch.dir = face;
    ch.frame = 0;
    ch.frameTimer = 0;
    return;
  }
  ch.frameTimer += dt;
  if (ch.frameTimer >= WALK_FRAME_DURATION_SEC) {
    ch.frameTimer -= WALK_FRAME_DURATION_SEC;
    ch.frame = (ch.frame + 1) % 4;
  }
  stepAlongPath(ch, dt);
}

function manhattan(a: Tile, b: Tile): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

/**
 * Turn sideways toward the item when it is to one side, else face the viewer:
 * the greeter is speaking, so it never turns its back to the screen.
 */
function faceToward(tile: Tile, item: PlacedFurniture, w: number): Direction {
  const dc = Math.max(item.col, Math.min(tile.col, item.col + w - 1)) - tile.col;
  if (dc > 0) return Direction.RIGHT;
  if (dc < 0) return Direction.LEFT;
  return Direction.DOWN;
}
