/**
 * The office's pet activity provider (the pet-care seam, see
 * petCareSystem.ts): it lets content pet cats join the idle pool — every
 * playroom toy, cat beds and houses, sofa naps — and finds a tired cat its
 * nap spot. Each activity has the pet's own pose (PET_ANIM_OF, steps in
 * petPlayAnims.ts).
 * Pets never drink coffee: no claim here names a coffee item, and pet care
 * refuses one anyway.
 *
 * Desks and tables are a pet-only nap (deskNap): agent cats work there.
 *
 * A pet with an owner (Pet.ownerCatId) prefers the owner's side: it lounges
 * on the owner's desk more (most while the owner works), picks spots near the
 * owner's seat and naps close to it. These are weights, not a leash: the same
 * activities stay possible everywhere.
 *
 * Spots come from the same spot sets the agent cats use, and every claim
 * reserves its tile through the shared service before the pet walks.
 */
import {
  PET_ACTIVITY_CHANCE,
  PET_OWNER_DESK_RADIUS_TILES,
  PET_OWNER_DESK_WEIGHT_MUL,
  PET_OWNER_NAP_NEAR_CHANCE,
  PET_OWNER_NEAR_SPOT_CHANCE,
  PET_OWNER_WORKING_MUL,
  PET_SLEEP_MAX_SEC,
  PET_SLEEP_MIN_SEC,
  PET_TOY_FUN_GAIN,
  PET_TOY_MAX_SEC,
  PET_TOY_MIN_SEC,
  SPOT_CLAIM_RETRIES,
} from '../../constants.js';
import type { PetActivityClaim, PetActivityProvider } from '../petCare/petCareTypes.js';
import type { Needs } from '../petCare/petNeeds.js';
import type { ActivitySpot, Pet, PlacedFurniture } from '../types.js';
import { DESK_NAP_ID, petDeskAnimFor } from './deskNapActivities.js';
import type { ActivitySpotSet } from './idleActivities.js';
import { personalityMul } from './personality.js';
import { isPetPlayAnim, PET_PLAY_ANIMS, petPlaySec } from './petPlayAnims.js';
import type { ClaimOutcome } from './spotClaims.js';
import { spotKeys } from './spotClaims.js';

/** Toys a pet plays with: every playroom activity of the agent cats. */
export const PET_TOY_IDS = [
  'yarn',
  'mouse',
  'teaser',
  'scratch',
  'box',
  'catTree',
  'tunnel',
] as const;
/** Where a pet naps: beds and houses first, then desk and table tops, then sofa seats, then the floor by a sofa. */
export const PET_NAP_IDS = ['bed', 'house', 'catBed', DESK_NAP_ID] as const;
const SOFA_NAP_ID = 'sleep';

/**
 * The pose a pet plays at each activity it claims: a toy's own play pose, a
 * curl on a bed, the loaf on a sofa and inside a house (only the peek shows).
 */
const PET_ANIM_OF: Readonly<Record<string, NonNullable<PetActivityClaim['anim']>>> = {
  yarn: 'yarn',
  mouse: 'mouse',
  teaser: 'teaser',
  scratch: 'scratch',
  box: 'box',
  catTree: 'catTree',
  tunnel: 'tunnel',
  bed: 'curl',
  catBed: 'curl',
  house: 'sleep',
  [SOFA_NAP_ID]: 'sleep',
};

/**
 * The pet's pose for an activity id, or undefined for one pets never do
 * (coffee). A desk nap's pose depends on the table kind (`furnitureType`).
 */
export function petAnimFor(id: string, furnitureType?: string): PetActivityClaim['anim'] {
  return id === DESK_NAP_ID ? petDeskAnimFor(furnitureType) : PET_ANIM_OF[id];
}

export interface PetActivityHost {
  spotSets(): Map<string, ActivitySpotSet>;
  furniture(): PlacedFurniture[];
  canTarget(pet: Pet, key: string): boolean;
  /** Reserve at walk start; the resume walks the pet there again after a won fight. */
  claim(pet: Pet, keys: string[], resume: () => void): ClaimOutcome;
  /** Walk the pet to a claim (used to resume after a won fight). */
  start(pet: Pet, claim: PetActivityClaim): boolean;
  rng: () => number;
  /** Where the pet's owner sits (its seat, else where it stands), or null: no owner in the office. */
  owner(pet: Pet): { col: number; row: number; working: boolean } | null;
}

const dist = (pet: Pet, s: ActivitySpot) =>
  Math.abs(s.col - pet.tileCol) + Math.abs(s.row - pet.tileRow);

const spotDist = (to: { col: number; row: number }, s: ActivitySpot) =>
  Math.abs(s.col - to.col) + Math.abs(s.row - to.row);

export class PetActivities implements PetActivityProvider {
  private readonly host: PetActivityHost;

  constructor(host: PetActivityHost) {
    this.host = host;
  }

  claimIdle(pet: Pet, needs: Readonly<Needs>): PetActivityClaim | null {
    const h = this.host;
    const mood = pet.personality;
    if (h.rng() >= PET_ACTIVITY_CHANCE * personalityMul(mood, 'petActivity')) return null;
    // A rested cat mostly plays; a drowsy one is likelier to nap.
    const napWeight = (needs.energy < 70 ? 1.5 : 0.4) * personalityMul(mood, 'sleep');
    const toyWeight = personalityMul(mood, 'play');
    const owner = h.owner(pet);
    // On the owner's desk: a bigger share, and bigger still while the owner works.
    const deskMul = (id: string) =>
      owner && id === DESK_NAP_ID && this.nearOwner(pet, id, owner).length > 0
        ? PET_OWNER_DESK_WEIGHT_MUL * (owner.working ? PET_OWNER_WORKING_MUL : 1)
        : 1;
    const options: Array<{ id: string; weight: number }> = [
      ...PET_TOY_IDS.map((id) => ({ id, weight: toyWeight })),
      ...PET_NAP_IDS.map((id) => ({ id, weight: napWeight * deskMul(id) })),
      { id: SOFA_NAP_ID, weight: napWeight / 2 },
    ].filter((o) => this.freeSpots(pet, o.id).length > 0);
    const total = options.reduce((s, o) => s + o.weight, 0);
    let roll = h.rng() * total;
    const pick = options.find((o) => (roll -= o.weight) < 0) ?? options[options.length - 1];
    if (!pick) return null;
    const spots = this.freeSpots(pet, pick.id);
    // The owner's desk first, else a random free spot (an owned pet often takes the nearest one);
    // on a re-pick try another one.
    const near = owner && pick.id === DESK_NAP_ID ? this.nearOwner(pet, pick.id, owner) : [];
    if (owner && near.length > 0) spots.splice(0, spots.length, ...near);
    for (let i = 0; i < SPOT_CLAIM_RETRIES && spots.length > 0; i++) {
      const byOwner = owner && h.rng() < PET_OWNER_NEAR_SPOT_CHANCE;
      if (byOwner) spots.sort((a, b) => spotDist(owner, a) - spotDist(owner, b));
      const spot = spots.splice(byOwner ? 0 : Math.floor(h.rng() * spots.length), 1)[0];
      const out = this.claimAt(pet, pick.id, spot);
      if (out !== 'repick') return out === 'fight' ? null : out;
    }
    return null;
  }

  claimSleep(pet: Pet): PetActivityClaim | null {
    const owner = this.host.owner(pet);
    // A tired owned pet mostly naps by the owner's seat; unowned ones draw nothing extra.
    const by = owner && this.host.rng() < PET_OWNER_NAP_NEAR_CHANCE ? owner : null;
    const byDist = (ids: readonly string[], fallback = false) =>
      ids
        .flatMap((id) => this.freeSpots(pet, id, fallback).map((spot) => ({ id, spot })))
        .sort((a, b) =>
          by ? spotDist(by, a.spot) - spotDist(by, b.spot) : dist(pet, a.spot) - dist(pet, b.spot),
        );
    const tiers = [
      ...(by
        ? [byDist([DESK_NAP_ID]).filter((c) => spotDist(by, c.spot) <= PET_OWNER_DESK_RADIUS_TILES)]
        : []),
      byDist(PET_NAP_IDS.filter((id) => id !== DESK_NAP_ID)),
      byDist([DESK_NAP_ID]),
      byDist([SOFA_NAP_ID]),
      byDist([SOFA_NAP_ID], true),
    ];
    let tries = 0;
    for (const tier of tiers) {
      for (const { id, spot } of tier) {
        if (tries++ >= SPOT_CLAIM_RETRIES) return null;
        const out = this.claimAt(pet, id, spot, true);
        if (out === 'fight') return null;
        if (out !== 'repick') return out;
      }
    }
    return null;
  }

  /** Free spots of an activity within the owner's desk radius. */
  private nearOwner(pet: Pet, id: string, owner: { col: number; row: number }): ActivitySpot[] {
    return this.freeSpots(pet, id).filter((s) => spotDist(owner, s) <= PET_OWNER_DESK_RADIUS_TILES);
  }

  /** Spots of an activity this pet may target (`fallback`: the sofa's floor spots). */
  private freeSpots(pet: Pet, id: string, fallback = false): ActivitySpot[] {
    const set = this.host.spotSets().get(id);
    const list = (fallback ? set?.fallback : set?.spots) ?? [];
    return list.filter((s) => spotKeys(s).every((k) => this.host.canTarget(pet, k)));
  }

  /** Claim one spot for the pet: the claim, or the contest outcome. */
  claimAt(
    pet: Pet,
    id: string,
    spot: ActivitySpot,
    tired = false,
  ): PetActivityClaim | 'repick' | 'fight' {
    const nap = tired || !PET_TOY_IDS.includes(id as (typeof PET_TOY_IDS)[number]);
    const rng = this.host.rng;
    const furnitureType = this.host.furniture().find((f) => f.uid === spot.itemUid)?.type;
    const anim = petAnimFor(id, furnitureType) ?? (nap ? 'sleep' : 'play');
    // A run through the tunnel plays start to end: the claim lasts exactly that long.
    const fixedSec = isPetPlayAnim(anim) && PET_PLAY_ANIMS[anim].fixed ? petPlaySec(anim) : 0;
    const claim: PetActivityClaim = {
      kind: id,
      col: spot.col,
      row: spot.row,
      furnitureType,
      durationSec:
        fixedSec ||
        (nap
          ? PET_SLEEP_MIN_SEC + rng() * (PET_SLEEP_MAX_SEC - PET_SLEEP_MIN_SEC)
          : PET_TOY_MIN_SEC + rng() * (PET_TOY_MAX_SEC - PET_TOY_MIN_SEC)),
      gains: nap ? {} : { fun: PET_TOY_FUN_GAIN },
      spot,
      anim,
      keys: spotKeys(spot),
      sleep: nap,
    };
    const out = this.host.claim(pet, claim.keys!, () => this.host.start(pet, claim));
    return out === 'ok' ? claim : out;
  }
}
