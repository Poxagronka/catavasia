/**
 * Scene puppets: cats an office scene (work talk, briefing meeting) moves
 * on purpose. A puppet skips the character FSM: OfficeState.update leaves it
 * to Puppets.update, which walks it to its goal, sits it down or keeps it
 * standing, and animates its talking mouth.
 *
 *   take(ch)              the cat leaves its social scene and idle activity
 *   goTo(id, tile, seat)  walk to a tile (stand) or a seat (sit); null = stay
 *   release(id)           hand the cat back to the FSM
 *
 * Taking a cat drops its idle activity, so the per-frame reservation
 * reconcile frees its spot. Pure of DOM; driven by OfficeScenes.
 */
import {
  SCENE_RELEASE_PAUSE_SEC,
  SCENE_TALK_FALLBACK_RADIUS,
  SOCIAL_TALK_MOUTH_SEC,
  WALK_FRAME_DURATION_SEC,
} from '../../constants.js';
import { findPath, isWalkable } from '../layout/tileMap.js';
import type { Character, Direction as DirectionT, Seat } from '../types.js';
import { CharacterState } from '../types.js';
import { snapToTile, stepAlongPath } from './characters.js';
import type { SocialWorld, Tile } from './socialMoves.js';
import { stopAfterStep } from './socialMoves.js';

export interface PuppetWorld extends SocialWorld {
  characters: Map<number, Character>;
  social: { leave(id: number): void };
}

interface Puppet {
  goal: Tile | null;
  seat: Seat | null;
  face: DirectionT | null;
  settled: boolean;
  talking: boolean;
  mouthT: number;
}

const keyOf = (t: Tile) => `${t.col},${t.row}`;

export class Puppets {
  private readonly byId = new Map<number, Puppet>();

  owns(id: number): boolean {
    return this.byId.has(id);
  }

  ids(): number[] {
    return [...this.byId.keys()];
  }

  isSettled(id: number): boolean {
    return this.byId.get(id)?.settled ?? false;
  }

  /** Take the cat over. It stops after its current step and stands. */
  take(ch: Character, world: PuppetWorld): void {
    if (this.byId.has(ch.id)) return;
    world.social.leave(ch.id);
    if (ch.state === CharacterState.ACTIVITY) {
      snapToTile(ch);
      ch.state = CharacterState.IDLE;
    }
    if (ch.activity) ch.lastActivityId = ch.activity.id;
    ch.activity = null;
    stopAfterStep(ch);
    if (ch.path.length > 0 && ch.moveProgress === 0) ch.path = [];
    this.byId.set(ch.id, {
      goal: null,
      seat: null,
      face: null,
      settled: ch.path.length === 0,
      talking: false,
      mouthT: 0,
    });
  }

  /** Walk to `seat` (sit), or to `goal` (stand). Both null: stay where it is. */
  goTo(id: number, goal: Tile | null, seat: Seat | null = null, face: DirectionT | null = null) {
    const p = this.byId.get(id);
    if (!p) return;
    p.seat = seat;
    p.goal = seat ? { col: seat.seatCol, row: seat.seatRow } : goal;
    p.face = face;
    p.settled = false;
  }

  /** Turn a puppet now (it keeps the direction while it stands). */
  face(id: number, dir: DirectionT): void {
    const p = this.byId.get(id);
    if (p) p.face = dir;
  }

  setTalking(id: number, on: boolean): void {
    const p = this.byId.get(id);
    if (p) p.talking = on;
  }

  /** Back to the FSM: a seated cat rests, a standing cat idles after a pause. */
  release(id: number, world: PuppetWorld): void {
    const p = this.byId.get(id);
    this.byId.delete(id);
    const ch = world.characters.get(id);
    if (!p || !ch) return;
    ch.social = undefined;
    stopAfterStep(ch);
    if (ch.state === CharacterState.TYPE && p.seat && p.seat.uid === ch.seatId) {
      ch.seatTimer = SCENE_RELEASE_PAUSE_SEC;
      return;
    }
    if (ch.state === CharacterState.TYPE) ch.state = CharacterState.IDLE;
    ch.wanderTimer = SCENE_RELEASE_PAUSE_SEC;
  }

  /** Per frame, before the social layer. Drops cats that left the office. */
  update(dt: number, world: PuppetWorld): void {
    for (const [id, p] of [...this.byId]) {
      const ch = world.characters.get(id);
      if (!ch || ch.matrixEffect === 'despawn') {
        this.byId.delete(id);
        continue;
      }
      ch.frameTimer += dt;
      if (ch.path.length > 0) {
        this.walk(ch, dt);
      } else if (!p.settled) {
        this.settleOrPlan(ch, p, world);
      }
      if (p.settled && p.face !== null && ch.state !== CharacterState.TYPE) ch.dir = p.face;
      this.animateMouth(ch, p, dt);
    }
  }

  private walk(ch: Character, dt: number): void {
    if (ch.state !== CharacterState.WALK) {
      ch.state = CharacterState.WALK;
      ch.frame = 0;
      ch.frameTimer = 0;
    }
    if (ch.frameTimer >= WALK_FRAME_DURATION_SEC) {
      ch.frameTimer -= WALK_FRAME_DURATION_SEC;
      ch.frame = (ch.frame + 1) % 4;
    }
    stepAlongPath(ch, dt);
  }

  private settleOrPlan(ch: Character, p: Puppet, world: PuppetWorld): void {
    const goal = p.goal;
    const here = ch.tileCol === goal?.col && ch.tileRow === goal?.row;
    if (goal && !here) {
      let blocked = world.blockedTiles;
      if (p.seat) {
        blocked = new Set(blocked);
        blocked.delete(keyOf(goal));
      }
      const path = findPath(ch.tileCol, ch.tileRow, goal.col, goal.row, world.tileMap, blocked);
      if (path.length > 0) {
        ch.path = path;
        ch.moveProgress = 0;
        return;
      }
    }
    // Arrived, or no way there: stay on this tile.
    snapToTile(ch);
    ch.frame = 0;
    ch.frameTimer = 0;
    p.settled = true;
    if (p.seat && here) {
      ch.state = CharacterState.TYPE;
      ch.dir = p.seat.facingDir;
    } else {
      ch.state = CharacterState.IDLE;
    }
  }

  /** The talking mouth: only while standing (a seated cat keeps its desk pose). */
  private animateMouth(ch: Character, p: Puppet, dt: number): void {
    const standing = ch.state === CharacterState.IDLE;
    if (!p.talking || !standing) {
      if (ch.social?.pose === 'talk') ch.social = undefined;
      return;
    }
    p.mouthT += dt;
    const frame = Math.floor(p.mouthT / SOCIAL_TALK_MOUTH_SEC) % 2;
    ch.social = { pose: 'talk', frame, bubble: null, anger: null, cloud: null };
  }
}

/**
 * Where a sender stands to talk to a receiver on `host`: its own tile when it
 * already stands beside the host, else the best free tile it can walk to next
 * to the host (left / right first: a cat right above another overlaps it),
 * then up to SCENE_TALK_FALLBACK_RADIUS tiles away. Null: no reachable tile
 * near the host, so the sender must not walk up.
 */
export function talkSpot(sender: Character, host: Tile, world: PuppetWorld): Tile | null {
  const from = { col: sender.tileCol, row: sender.tileRow };
  if (from.row === host.row && Math.abs(from.col - host.col) === 1) return from;
  const occupied = new Set<string>();
  for (const c of world.characters.values()) {
    if (c.id !== sender.id) occupied.add(keyOf({ col: c.tileCol, row: c.tileRow }));
  }
  // Walking steps from the sender to every tile it can reach (4-connected).
  const steps = new Map<string, number>([[keyOf(from), 0]]);
  const queue: Tile[] = [from];
  for (let i = 0; i < queue.length; i++) {
    const t = queue[i];
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const n = { col: t.col + dc, row: t.row + dr };
      if (steps.has(keyOf(n)) || !isWalkable(n.col, n.row, world.tileMap, world.blockedTiles))
        continue;
      steps.set(keyOf(n), steps.get(keyOf(t))! + 1);
      queue.push(n);
    }
  }
  // Side by side, then diagonal, then right above / below the host.
  const rank = (t: Tile) => (t.row === host.row ? 0 : t.col !== host.col ? 1 : 2);
  for (let r = 1; r <= SCENE_TALK_FALLBACK_RADIUS; r++) {
    let best: Tile | null = null;
    let bestScore = Infinity;
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== r) continue;
        const t = { col: host.col + dc, row: host.row + dr };
        const n = steps.get(keyOf(t));
        if (n === undefined || (n > 0 && occupied.has(keyOf(t)))) continue;
        const score = rank(t) * 10_000 + n;
        if (score < bestScore) [best, bestScore] = [t, score];
      }
    }
    if (best) return best;
  }
  return null;
}
