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

function ends(run: IdleActivityRun): { from: number; to: number; row: number } | null {
  const spot = run.spot;
  if (!spot?.exit) return null;
  const forward = (run.passes ?? 0) % 2 === 0;
  return {
    from: forward ? spot.col : spot.exit.col,
    to: forward ? spot.exit.col : spot.col,
    row: spot.row,
  };
}

/** Advance one tick. Returns true once every pass is done (the cat is back at its spot). */
export function advanceRunThrough(ch: Character, run: IdleActivityRun, dt: number): boolean {
  const e = ends(run);
  if (!e) return true;
  const fromX = e.from * TILE_SIZE + TILE_SIZE / 2;
  const toX = e.to * TILE_SIZE + TILE_SIZE / 2;
  const dist = Math.abs(toX - fromX) || 1;
  run.progress = Math.min(1, (run.progress ?? 0) + (TUNNEL_RUN_SPEED_PX_PER_SEC * dt) / dist);
  ch.x = fromX + (toX - fromX) * run.progress;
  ch.dir = toX > fromX ? Direction.RIGHT : Direction.LEFT;
  if (ch.frameTimer >= WALK_FRAME_DURATION_SEC / 2) {
    ch.frameTimer = 0;
    ch.frame = (ch.frame + 1) % 4;
  }
  if (run.progress < 1) return false;
  ch.tileCol = e.to;
  run.progress = 0;
  run.passes = (run.passes ?? 0) + 1;
  return run.passes >= TUNNEL_PASSES;
}

/** True while the cat is inside the tunnel (not drawn, not clickable). */
export function isHiddenInRunThrough(ch: Character): boolean {
  const spot = ch.activity?.spot;
  if (ch.state !== CharacterState.ACTIVITY || !spot?.exit) return false;
  const lo = Math.min(spot.col, spot.exit.col) + 1;
  const hi = Math.max(spot.col, spot.exit.col);
  return ch.x > lo * TILE_SIZE - VISIBLE_LIP_PX && ch.x < hi * TILE_SIZE + VISIBLE_LIP_PX;
}
