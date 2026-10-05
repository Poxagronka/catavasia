/**
 * Spot reservations: the one registry of which cat holds which tile.
 *
 * A cat (agent or pet) reserves a spot — a seat, sofa seat, bed, house, toy
 * spot, bowl side, litter box or coffee spot — when it STARTS walking to it.
 * Nobody else may target a spot another cat reserved or occupies. Idle
 * activities, pet care, joint play and seat assignment all go through here.
 *
 * Keys are "col,row" tile keys. Holders are numeric actor ids (agent ids, or
 * the stand-in ids of pet cats, see petActors.ts). A holder may hold several
 * keys: a tunnel spot plus its exit, or a desk seat plus an idle spot.
 *
 * Tags: 'seat' = an agent's assigned seat (long-lived, never contested);
 * 'spot' = everything else.
 *
 * Contention: a claim on a key someone else reserved less than `windowSec`
 * ago, before that cat arrived, is a CONTEST. The service rolls it with its
 * rng: a fight (chance `fightChance`, winner 50/50) or a plain re-pick. Any
 * other claim on a held key is 'taken'. The caller acts on the outcome (see
 * spotClaims.ts): it starts the fight scene, and the loser picks again.
 *
 * Release: holders release keys they stop wanting (spotClaims.reconcile runs
 * every frame), and `prune` drops every key of a holder that despawned.
 *
 * Pure: no DOM, no OfficeState, injected rng — unit-tested directly.
 */
import { SPOT_CONTEST_FIGHT_CHANCE, SPOT_CONTEST_WINDOW_SEC } from '../../constants.js';

export type SpotTag = 'seat' | 'spot';

export interface Reservation {
  holder: number;
  tag: SpotTag;
  /** Service clock (s) when it was reserved. */
  at: number;
  /** The holder reached the spot: no longer contestable. */
  arrived: boolean;
}

export type ClaimResult =
  | { ok: true }
  | { ok: false; outcome: 'taken'; rival: number }
  | { ok: false; outcome: 'repick'; rival: number }
  | { ok: false; outcome: 'fight'; rival: number; winner: number };

export interface SpotReservationOptions {
  rng?: () => number;
  windowSec?: number;
  fightChance?: number;
}

export class SpotReservations {
  rng: () => number;
  windowSec: number;
  fightChance: number;
  private readonly byKey = new Map<string, Reservation>();
  private now = 0;

  constructor(opts: SpotReservationOptions = {}) {
    this.rng = opts.rng ?? Math.random;
    this.windowSec = opts.windowSec ?? SPOT_CONTEST_WINDOW_SEC;
    this.fightChance = opts.fightChance ?? SPOT_CONTEST_FIGHT_CHANCE;
  }

  /** Advance the service clock (the contention window counts in it). */
  tick(dt: number): void {
    this.now += dt;
  }

  get(key: string): Reservation | undefined {
    return this.byKey.get(key);
  }

  holderOf(key: string): number | undefined {
    return this.byKey.get(key)?.holder;
  }

  /** Nobody but `holder` holds the key. */
  isFree(key: string, holder: number): boolean {
    const r = this.byKey.get(key);
    return !r || r.holder === holder;
  }

  /** A fresh claim by someone else that `holder` may still contest. */
  isContestable(key: string, holder: number): boolean {
    const r = this.byKey.get(key);
    return (
      !!r &&
      r.holder !== holder &&
      r.tag === 'spot' &&
      !r.arrived &&
      this.now - r.at <= this.windowSec
    );
  }

  /**
   * Keys `holder` must not pick: held by someone else and not contestable.
   * Contestable keys stay pickable, so two cats CAN go for one spot at once.
   */
  blockedFor(holder: number): Set<string> {
    const out = new Set<string>();
    for (const key of this.byKey.keys()) {
      if (!this.isFree(key, holder) && !this.isContestable(key, holder)) out.add(key);
    }
    return out;
  }

  /** Every key held by someone other than `holder` (contestable ones too). */
  heldByOthers(holder: number): Set<string> {
    const out = new Set<string>();
    for (const [key, r] of this.byKey) if (r.holder !== holder) out.add(key);
    return out;
  }

  /**
   * Reserve all `keys` for `holder`, or none. On a held key: 'taken', or a
   * contest rolled into 'fight' / 'repick'.
   */
  claim(keys: readonly string[], holder: number, tag: SpotTag = 'spot'): ClaimResult {
    for (const key of keys) {
      const r = this.byKey.get(key);
      if (!r || r.holder === holder) continue;
      if (!this.isContestable(key, holder)) return { ok: false, outcome: 'taken', rival: r.holder };
      if (this.rng() < this.fightChance) {
        const winner = this.rng() < 0.5 ? holder : r.holder;
        return { ok: false, outcome: 'fight', rival: r.holder, winner };
      }
      return { ok: false, outcome: 'repick', rival: r.holder };
    }
    for (const key of keys) {
      const r = this.byKey.get(key);
      if (r?.holder === holder) continue; // keep its age, tag and arrival
      this.byKey.set(key, { holder, tag, at: this.now, arrived: false });
    }
    return { ok: true };
  }

  /** The holder reached its spot(s): they stop being contestable. */
  arrive(holder: number): void {
    for (const r of this.byKey.values()) if (r.holder === holder) r.arrived = true;
  }

  /** Hand `from`'s spot keys to `to` (a contest winner takes the spot). */
  transfer(keys: readonly string[], from: number, to: number): void {
    for (const key of keys) {
      const r = this.byKey.get(key);
      if (r?.holder === from) this.byKey.set(key, { ...r, holder: to, arrived: false });
    }
  }

  keysOf(holder: number, tag?: SpotTag): string[] {
    const out: string[] = [];
    for (const [key, r] of this.byKey) {
      if (r.holder === holder && (!tag || r.tag === tag)) out.push(key);
    }
    return out;
  }

  /** Distinct holders of keys with this tag. */
  holders(tag: SpotTag): Set<number> {
    const out = new Set<number>();
    for (const r of this.byKey.values()) if (r.tag === tag) out.add(r.holder);
    return out;
  }

  releaseKey(key: string, holder: number): void {
    if (this.byKey.get(key)?.holder === holder) this.byKey.delete(key);
  }

  /** Drop every key of `holder` (of one tag, when given). */
  release(holder: number, tag?: SpotTag): void {
    for (const key of this.keysOf(holder, tag)) this.byKey.delete(key);
  }

  /** Drop every key whose holder is gone (despawned agent, removed pet). */
  prune(isAlive: (holder: number) => boolean): void {
    for (const [key, r] of [...this.byKey]) if (!isAlive(r.holder)) this.byKey.delete(key);
  }

  /**
   * Make the 'seat' reservations exactly `seats` ([key, holder] of every
   * assigned seat). A seat outranks a 'spot' on the same tile: the user or
   * the server seated an agent there, so the cat napping on it gives way.
   */
  syncSeats(seats: ReadonlyArray<readonly [string, number]>): void {
    const want = new Map(seats);
    for (const [key, r] of [...this.byKey]) {
      if (r.tag === 'seat' && want.get(key) !== r.holder) this.byKey.delete(key);
    }
    for (const [key, holder] of want) {
      const r = this.byKey.get(key);
      if (r?.tag === 'seat' && r.holder === holder) continue;
      this.byKey.set(key, { holder, tag: 'seat', at: this.now, arrived: true });
    }
  }

  /** Number of reserved keys (tests, leak checks). */
  get size(): number {
    return this.byKey.size;
  }
}
