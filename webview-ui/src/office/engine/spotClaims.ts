/**
 * Spot claims: the office-side glue around the shared reservation service
 * (spotReservations.ts). Every cat claims through here — agent idle
 * activities, pet care (bowls, litter, provider claims), joint play.
 *
 *   claim(selfId, keys, resume) -> 'ok' | 'repick' | 'fight'
 *     Called when a cat STARTS walking to a spot. 'ok': walk. 'repick':
 *     choose another spot. 'fight': two cats went for the spot at the same
 *     moment and the contest roll said fight — the social fight scene starts
 *     between them and the cat must not walk now. The winner keeps (or gets)
 *     the spot and walks there again when the scene ends (its `resume`);
 *     the loser picks something else.
 *
 *   reconcile(wants, seats, isAlive, onLost)
 *     Once per frame. Keys nobody wants any more are released (arrived then
 *     left, interrupted, a joint play over), holders that despawned lose all
 *     keys, assigned seats are synced in, and a cat whose spot now belongs to
 *     someone else (a seat assigned under a napping cat, a lost contest) is
 *     told through `onLost` so it drops that activity.
 */
import { SPOT_CONTEST_FIGHT_RADIUS_TILES } from '../../constants.js';
import type { ActivitySpot, Character } from '../types.js';
import type { CatSocial } from './catSocial.js';
import { isPetActorId } from './petActors.js';
import { SpotReservations } from './spotReservations.js';

export type ClaimOutcome = 'ok' | 'repick' | 'fight';

export interface ClaimHost {
  /** The agent, or the stand-in actor of a pet, with this id. */
  actor(id: number): Character | undefined;
  /** Walk this cat again to the target it is heading for (a won fight), or null. */
  resumeOf(id: number): (() => void) | null;
}

/** A holder's wanted keys this frame, and whether it stands on them. */
export interface SpotWant {
  keys: string[];
  arrived: boolean;
}

/** Tile keys a spot occupies: the tile, plus the exit of a run-through. */
export function spotKeys(spot: ActivitySpot): string[] {
  return spot.exit ? [spot.key, `${spot.exit.col},${spot.exit.row}`] : [spot.key];
}

export class SpotClaims {
  /** Prize of a contest fight: the winner's keys, held until the scene ends. */
  private readonly prizes = new Map<number, { keys: string[]; resume: () => void }>();
  /** Spots of cats in a joint toy play, held while the scene runs. */
  private readonly joint = new Map<number, string[]>();

  private readonly social: CatSocial;
  private readonly host: ClaimHost;
  readonly spots: SpotReservations;

  constructor(social: CatSocial, host: ClaimHost, spots = new SpotReservations()) {
    this.social = social;
    this.host = host;
    this.spots = spots;
  }

  /** May `holder` target `key`: free, its own, or a fresh claim it may contest. */
  canTarget(holder: number, key: string): boolean {
    return this.spots.isFree(key, holder) || this.spots.isContestable(key, holder);
  }

  /** Keys `holder` must not pick (see SpotReservations.blockedFor). */
  blockedFor(holder: number): Set<string> {
    return this.spots.blockedFor(holder);
  }

  claim(selfId: number, keys: string[], resume: () => void): ClaimOutcome {
    const res = this.spots.claim(keys, selfId);
    if (res.ok) return 'ok';
    if (res.outcome !== 'fight') return 'repick';
    const self = this.host.actor(selfId);
    const rival = this.host.actor(res.rival);
    if (!self || !rival) return 'repick';
    const rivalResume = this.host.resumeOf(res.rival);
    const rivalKeys = this.spots.keysOf(res.rival, 'spot');
    const contested = keys.filter((k) => this.spots.holderOf(k) === res.rival);
    // The dust cloud rides on the first cat: an agent when there is one.
    const [a, b] = isPetActorId(self.id) && !isPetActorId(rival.id) ? [rival, self] : [self, rival];
    const started = this.social.trySocialEncounter(a, b, {
      kind: 'fight',
      radius: SPOT_CONTEST_FIGHT_RADIUS_TILES,
    });
    if (!started) return 'repick';
    if (res.winner === selfId) {
      this.spots.transfer(contested, res.rival, selfId);
      this.spots.claim(keys, selfId); // keys the rival did not hold
      this.prizes.set(selfId, { keys, resume });
    } else if (rivalResume) {
      this.prizes.set(res.rival, { keys: rivalKeys, resume: rivalResume });
    }
    return 'fight';
  }

  /** Hold `keys` for a cat in joint play until its scene ends. */
  setJoint(id: number, keys: string[]): void {
    this.joint.set(id, keys);
  }

  /** CatSocial onSceneEnd: joint spots end; a fight winner walks to its prize. */
  onSceneEnd(id: number, kind: string, reason: 'done' | 'interrupted'): void {
    this.joint.delete(id);
    const prize = this.prizes.get(id);
    if (!prize) return;
    this.prizes.delete(id);
    if (kind === 'fight' && reason === 'done') prize.resume();
  }

  /** The cat holds a prize it will walk to after its fight (tests, hooks). */
  hasPrize(id: number): boolean {
    return this.prizes.has(id);
  }

  reconcile(
    wants: ReadonlyMap<number, SpotWant>,
    seats: ReadonlyArray<readonly [string, number]>,
    isAlive: (id: number) => boolean,
    onLost: (id: number) => void,
  ): void {
    const spots = this.spots;
    spots.syncSeats(seats);
    spots.prune(isAlive);
    for (const map of [this.prizes, this.joint] as Map<number, unknown>[]) {
      for (const id of [...map.keys()]) if (!isAlive(id)) map.delete(id);
    }
    const wanted = new Map<number, Set<string>>();
    const add = (id: number, keys: readonly string[]) => {
      let set = wanted.get(id);
      if (!set) wanted.set(id, (set = new Set()));
      for (const k of keys) set.add(k);
    };
    for (const [id, w] of wants) add(id, w.keys);
    for (const [id, keys] of this.joint) add(id, keys);
    for (const [id, p] of this.prizes) add(id, p.keys);
    for (const id of spots.holders('spot')) {
      for (const key of spots.keysOf(id, 'spot')) {
        if (!wanted.get(id)?.has(key)) spots.releaseKey(key, id);
      }
    }
    for (const [id, w] of wants) {
      const lost = w.keys.some((key) => {
        const holder = spots.holderOf(key);
        return holder !== undefined && holder !== id;
      });
      if (lost) {
        onLost(id);
        continue;
      }
      spots.claim(w.keys, id); // re-takes a key that was free (no-op when held)
      if (w.arrived) spots.arrive(id);
    }
  }
}
