import {
  PET_ANIM_DRINK_SEC,
  PET_ANIM_EAT_SEC,
  PET_ANIM_PETTED_SEC,
  PET_ANIM_PLAY_SEC,
  PET_ANIM_POOP_SEC,
  PET_SLEEP_MIN_SEC,
  POOP_GRIMACE_SEC,
} from '../../constants.js';
import type { ActivitySpot, Pet, PetCareAnim, PetPlayAnim } from '../types.js';
import type { Needs, RequestKind } from './petNeeds.js';

/** Shapes shared by the pet-care runtime (petCareSystem.ts documents the seam). */
export const FORBIDDEN_CLAIM_TYPES = ['COFFEE'];

export interface PetActivityClaim {
  kind: string;
  col: number;
  row: number;
  /** Furniture the activity uses, if any (checked against the coffee rule). */
  furnitureType?: string;
  durationSec: number;
  gains?: Partial<Needs>;
  /** The spot (draw offsets, a house that hides the cat). Omitted: plain floor tile. */
  spot?: ActivitySpot;
  /** Pose while there (a play pose per toy, see engine/petPlayAnims.ts); default: stand and wait. */
  anim?: 'play' | 'sleep' | PetPlayAnim;
  /** Spot keys the provider reserved for the pet (kept until the claim ends). */
  keys?: string[];
  /** A nap: energy refills while it lasts, and the cat wakes once it is full. */
  sleep?: boolean;
}

export interface PetActivityProvider {
  claimIdle(pet: Pet, needs: Readonly<Needs>): PetActivityClaim | null;
  /** A tired cat's nap spot (bed, house, sofa, floor), nearest first. */
  claimSleep?(pet: Pet): PetActivityClaim | null;
}

/** The spot reservation service, as pet care sees it (spotClaims.ts implements it). */
export interface PetSpotBroker {
  /** May the pet target this tile: free, or a fresh claim it may contest? */
  canTarget(pet: Pet, key: string): boolean;
  /** Reserve keys at walk start. 'fight': a contest scene started instead. */
  claim(pet: Pet, keys: string[], resume: () => void): 'ok' | 'repick' | 'fight';
}

export type PetMenuAction = 'feed' | 'water' | 'scratch' | 'play' | 'clean' | 'info';

/** The care menu over a litter box or a floor poop (petCareSystem.ts openCareMenu). */
export type CareMenu = { kind: 'box'; uid: string } | { kind: 'poop'; id: string };
export type CareMenuAction = 'clean' | 'change' | 'info' | 'cleanup';

/** 'zoom': a zoomies dash after a box visit. */
export type Goal = 'eat' | 'drink' | 'poop' | 'claim' | 'zoom';
export interface Seek {
  goal: Goal;
  uid: string | null;
  col: number;
  row: number;
  claim?: PetActivityClaim;
  /** Reserved spot keys for this walk. */
  keys: string[];
}
export interface Anim {
  kind: PetCareAnim | PetPlayAnim | 'wait';
  t: number;
  dur: number;
  done: () => void;
}
export interface PetRuntime {
  seek: Seek | null;
  anim: Anim | null;
  decideTimer: number;
  request: RequestKind | null;
  nextMeowAt: number;
  /** Hand-fed (no bowl reachable): draw a treat dish under the cat. */
  dish: boolean;
  /** Spot keys the current pose holds (a bowl side, a bed), and whether it is there. */
  keys: string[];
  /** The claim the pet is walking to or doing (resumed after a won fight). */
  claim: PetActivityClaim | null;
  /** Litter boxes this cat turned down (flies) since its last poop. */
  refused: Set<string>;
  /** Zoomies dashes left. */
  dashes: number;
}

export interface Effect {
  /** scoop / bag / pour: the clean-up tools (litter scoop, poop bag, fresh litter). */
  kind: 'heart' | 'sparkle' | 'scoop' | 'bag' | 'pour' | 'glint';
  x: number;
  y: number;
  /** Seconds since spawn; negative = not shown yet (staggered hearts). */
  age: number;
  /** The cat a heart belongs to (its request bubble waits for the hearts). */
  petId?: string;
  /** Seconds it lasts (default EFFECT_MAX_AGE_SEC). */
  life?: number;
  /** The poop the bag picks up: removed from the floor once the bag is down. */
  poopId?: string;
  /** The box the scoop sifts: its piles go once the scoop lifts them out. */
  boxUid?: string;
}
export const EFFECT_MAX_AGE_SEC = 2;
/** Seconds into the bag effect when the poop is in the bag. */
export const BAG_PICKUP_SEC = 0.45;
/** Seconds into the scoop effect when the clumps come out of the box. */
export const SCOOP_LIFT_SEC = 0.6;

export const ANIM_SEC: Record<PetCareAnim, number> = {
  eat: PET_ANIM_EAT_SEC,
  drink: PET_ANIM_DRINK_SEC,
  poop: PET_ANIM_POOP_SEC,
  petted: PET_ANIM_PETTED_SEC,
  play: PET_ANIM_PLAY_SEC,
  sleep: PET_SLEEP_MIN_SEC,
  grimace: POOP_GRIMACE_SEC,
};
