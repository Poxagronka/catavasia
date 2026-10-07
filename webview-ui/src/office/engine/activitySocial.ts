/**
 * Social life inside idle activities. Two cats at the coffee spot, or two
 * cats on playroom toys near each other (agents or pets), may:
 *   - talk: a stationary scene (trySocialEncounter with `activity` set), the
 *     cats keep their spots and poses;
 *   - play together on one toy (playroom only): joint play in toy mode —
 *     both walk to the two sides of a yarn ball, a mouse or a feather teaser
 *     and take turns at it; around the play tunnel it is a chase instead.
 * Pets join through their stand-in actors (petActors.ts). Spots of a joint
 * play are reserved for both cats through the shared service.
 */
import {
  ACTIVITY_JOINT_PLAY_CHANCE,
  ACTIVITY_SOCIAL_CHANCE,
  ACTIVITY_SOCIAL_CHECK_SEC,
  ACTIVITY_TALK_EXTEND_SEC,
  SOCIAL_ACTIVITY_RADIUS_TILES,
  SOCIAL_TOY_TURN_SEC,
} from '../../constants.js';
import type { ActivitySpot, Character } from '../types.js';
import { Direction } from '../types.js';
import type { CatSocial } from './catSocial.js';
import type { ActivitySpotSet } from './idleActivities.js';
import { pairMul } from './personality.js';
import type { Tile } from './socialMoves.js';
import { tileDistance, tileOf } from './socialMoves.js';
import type { SpotClaims } from './spotClaims.js';

/** A cat doing an activity right now: an agent, or a pet's actor. */
export interface Participant {
  actor: Character;
  /** Idle activity id ('coffee', 'yarn', ...) or a pet claim kind. */
  activityId: string;
  spot: ActivitySpot;
}

export interface ActivitySocialHost {
  social: CatSocial;
  claims: SpotClaims;
  spotSets: Map<string, ActivitySpotSet>;
  participants(): Participant[];
  isWalkable(col: number, row: number): boolean;
  /** End the cat's activity so a scene can move it (it stands, IDLE). */
  stop(p: Participant): void;
  /** Keep the cat at its activity `sec` longer (it stays for a talk). */
  extend(p: Participant, sec: number): void;
  /** Its turn at the toy: play the toy activity `toyId` at `spot` for `sec`. */
  playTurn(actorId: number, toyId: string, spot: ActivitySpot, sec: number): void;
}

/** Toys two cats can share by turns (two sides of the toy). */
export const JOINT_TOYS = ['yarn', 'mouse', 'teaser'] as const;
const PLAYROOM = new Set(['yarn', 'mouse', 'teaser', 'scratch', 'box', 'catTree', 'tunnel']);

export class ActivitySocial {
  rng: () => number;
  private timer = ACTIVITY_SOCIAL_CHECK_SEC;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }

  update(dt: number, host: ActivitySocialHost): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = ACTIVITY_SOCIAL_CHECK_SEC;
    const pair = this.findPair(host);
    const chance = pair
      ? ACTIVITY_SOCIAL_CHANCE *
        pairMul(pair[0].actor.personality, pair[1].actor.personality, 'encounter')
      : 0;
    if (pair && this.rng() < chance) this.encounter(pair[0], pair[1], host);
  }

  /** Closest pair sharing coffee or the playroom, both free and rested. */
  findPair(host: ActivitySocialHost): [Participant, Participant] | null {
    const ps = host.participants().filter((p) => !host.social.isInScene(p.actor.id));
    let best: [Participant, Participant] | null = null;
    let bestD = Infinity;
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) {
        const [a, b] = [ps[i], ps[j]];
        if (groupOf(a.activityId) === null || groupOf(a.activityId) !== groupOf(b.activityId))
          continue;
        const d = tileDistance(tileOf(a.actor), tileOf(b.actor));
        if (d > SOCIAL_ACTIVITY_RADIUS_TILES || d >= bestD) continue;
        if (!host.social.isPairReady(a.actor.id, b.actor.id)) continue;
        best = [a, b];
        bestD = d;
      }
    return best;
  }

  /** Talk, or (playroom) joint play. Returns what started, or null. */
  encounter(
    a: Participant,
    b: Participant,
    host: ActivitySocialHost,
    joint = groupOf(a.activityId) === 'playroom' && this.rng() < ACTIVITY_JOINT_PLAY_CHANCE,
  ): 'talk' | 'fight' | 'toy' | 'chase' | null {
    if (joint) {
      const started = this.jointPlay(a, b, host);
      if (started) return started;
    }
    const kind = host.social.trySocialEncounter(a.actor, b.actor, {
      activity: a.activityId,
      kind: groupOf(a.activityId) === 'coffee' ? undefined : 'talk',
    });
    if (!kind) return null;
    host.extend(a, ACTIVITY_TALK_EXTEND_SEC);
    host.extend(b, ACTIVITY_TALK_EXTEND_SEC);
    return kind === 'fight' ? 'fight' : 'talk';
  }

  private jointPlay(
    a: Participant,
    b: Participant,
    host: ActivitySocialHost,
  ): 'toy' | 'chase' | null {
    if (a.activityId === 'tunnel' || b.activityId === 'tunnel') {
      host.stop(a);
      host.stop(b);
      const ok = host.social.startJointPlay(
        a.actor,
        b.actor,
        { kind: 'chase' },
        SOCIAL_ACTIVITY_RADIUS_TILES,
      );
      return ok ? 'chase' : null;
    }
    const at = [a, b].find((p) => (JOINT_TOYS as readonly string[]).includes(p.activityId));
    const pair = at ? this.toySpots(at, host) : null;
    if (!at || !pair) return null;
    // The cat already at the toy keeps its side; the other takes the far one.
    const [sa, sb] = at === a ? pair : [pair[1], pair[0]];
    // Plain reservations (no contest roll): a third cat on a side means no play.
    const claims = host.claims;
    const free = (key: string, id: number) => claims.spots.isFree(key, id);
    if (!free(sa.key, a.actor.id) || !free(sb.key, b.actor.id)) return null;
    claims.spots.claim([sa.key], a.actor.id);
    claims.spots.claim([sb.key], b.actor.id);
    host.stop(a);
    host.stop(b);
    claims.setJoint(a.actor.id, [sa.key]);
    claims.setJoint(b.actor.id, [sb.key]);
    const spotOf = new Map([
      [a.actor.id, sa],
      [b.actor.id, sb],
    ]);
    const toyId = at.activityId;
    const ok = host.social.startJointPlay(a.actor, b.actor, {
      kind: 'toy',
      toyId: at.spot.itemUid ?? toyId,
      spots: [tile(sa), tile(sb)],
      turnSec: SOCIAL_TOY_TURN_SEC,
      onTurn: (catId) => {
        const spot = spotOf.get(catId);
        if (spot) host.playTurn(catId, toyId, spot, SOCIAL_TOY_TURN_SEC);
      },
    });
    if (!ok) {
      claims.onSceneEnd(a.actor.id, 'play', 'interrupted');
      claims.onSceneEnd(b.actor.id, 'play', 'interrupted');
      return null;
    }
    return 'toy';
  }

  /**
   * Two sides of the toy the participant uses: its own spot, and the toy's
   * other spot (or, for a one-sided toy, the floor tile behind its spot).
   */
  private toySpots(p: Participant, host: ActivitySocialHost): [ActivitySpot, ActivitySpot] | null {
    const all = host.spotSets.get(p.activityId)?.spots ?? [];
    const other = all.find((s) => s.itemUid === p.spot.itemUid && s.key !== p.spot.key);
    if (other) return [p.spot, other];
    const dc = p.spot.facing === Direction.RIGHT ? -1 : p.spot.facing === Direction.LEFT ? 1 : 0;
    const col = p.spot.col + dc;
    if (dc === 0 || !host.isWalkable(col, p.spot.row)) return null;
    return [p.spot, { ...p.spot, key: `${col},${p.spot.row}`, col, offsetX: 0 }];
  }
}

function groupOf(activityId: string): 'coffee' | 'playroom' | null {
  if (activityId === 'coffee' || activityId === 'coffeeSip') return 'coffee';
  return PLAYROOM.has(activityId) ? 'playroom' : null;
}

function tile(s: ActivitySpot): Tile {
  return { col: s.col, row: s.row };
}
