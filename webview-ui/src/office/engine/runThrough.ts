/**
 * Run-through activities (the play tunnel): the cat runs from its spot to the
 * exit and back a few times, hidden while inside the toy.
 */

import {
  TUNNEL_PASSES,
  TUNNEL_RUN_SPEED_PX_PER_SEC,
  WALK_FRAME_DURATION_SEC,
} from '../../constants.js';
import type { Character, IdleActivityRun } from '../types.js';
import { CharacterState, Direction, TILE_SIZE } from '../types.js';

/** Px of a tunnel end the cat stays visible in before it vanishes inside. */
const VISIBLE_LIP_PX = 4;

/** The pass's start and end tile centres (world px): forward on even passes. */
function ends(run: IdleActivityRun): { from: Point; to: Point } | null {
  const spot = run.spot;
  if (!spot?.exit) return null;
  const forward = (run.passes ?? 0) % 2 === 0;
  const a = centre(spot.col, spot.row);
  const b = centre(spot.exit.col, spot.exit.row);
  return forward ? { from: a, to: b } : { from: b, to: a };
}

interface Point {
  x: number;
  y: number;
}

function centre(col: number, row: number): Point {
  return { x: col * TILE_SIZE + TILE_SIZE / 2, y: row * TILE_SIZE + TILE_SIZE / 2 };
}

/** Advance one tick. Returns true once every pass is done (the cat is back at its spot). */
export function advanceRunThrough(ch: Character, run: IdleActivityRun, dt: number): boolean {
  const e = ends(run);
  if (!e) return true;
  const { from, to } = e;
  const dist = Math.abs(to.x - from.x) + Math.abs(to.y - from.y) || 1;
  run.progress = Math.min(1, (run.progress ?? 0) + (TUNNEL_RUN_SPEED_PX_PER_SEC * dt) / dist);
  ch.x = from.x + (to.x - from.x) * run.progress;
  ch.y = from.y + (to.y - from.y) * run.progress;
  ch.dir =
    to.x !== from.x
      ? to.x > from.x
        ? Direction.RIGHT
        : Direction.LEFT
      : to.y > from.y
        ? Direction.DOWN
        : Direction.UP;
  if (ch.frameTimer >= WALK_FRAME_DURATION_SEC / 2) {
    ch.frameTimer = 0;
    ch.frame = (ch.frame + 1) % 4;
  }
  if (run.progress < 1) return false;
  ch.tileCol = Math.floor(to.x / TILE_SIZE);
  ch.tileRow = Math.floor(to.y / TILE_SIZE);
  run.progress = 0;
  run.passes = (run.passes ?? 0) + 1;
  return run.passes >= TUNNEL_PASSES;
}

/** True while the cat is inside the tunnel (not drawn, not clickable). */
export function isHiddenInRunThrough(ch: Character): boolean {
  const spot = ch.activity?.spot;
  if (ch.state !== CharacterState.ACTIVITY || !spot?.exit) return false;
  // Along the tube's axis: between the two ends, past a lip at each.
  const vertical = spot.col === spot.exit.col;
  const pos = vertical ? ch.y : ch.x;
  const a = vertical ? spot.row : spot.col;
  const b = vertical ? spot.exit.row : spot.exit.col;
  const lo = Math.min(a, b) + 1;
  const hi = Math.max(a, b);
  return pos > lo * TILE_SIZE - VISIBLE_LIP_PX && pos < hi * TILE_SIZE + VISIBLE_LIP_PX;
}
