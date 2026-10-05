import {
  PET_ANIM_DRINK_SEC,
  PET_ANIM_EAT_SEC,
  PET_ANIM_PETTED_SEC,
  PET_ANIM_PLAY_SEC,
  PET_ANIM_POOP_SEC,
} from '../../constants.js';
import type { Pet, PetCareAnim } from '../types.js';
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
}

export interface PetActivityProvider {
  claimIdle(pet: Pet, needs: Readonly<Needs>): PetActivityClaim | null;
}

export type PetMenuAction = 'feed' | 'water' | 'scratch' | 'play' | 'clean' | 'info';

export type Goal = 'eat' | 'drink' | 'poop' | 'claim';
export interface Seek {
  goal: Goal;
  uid: string | null;
  col: number;
  row: number;
  claim?: PetActivityClaim;
}
export interface Anim {
  kind: PetCareAnim | 'wait';
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
}

export interface Effect {
  kind: 'heart' | 'sparkle';
  x: number;
  y: number;
  /** Seconds since spawn; negative = not shown yet (staggered hearts). */
  age: number;
  /** The cat a heart belongs to (its request bubble waits for the hearts). */
  petId?: string;
}
export const EFFECT_MAX_AGE_SEC = 2;

export const ANIM_SEC: Record<PetCareAnim, number> = {
  eat: PET_ANIM_EAT_SEC,
  drink: PET_ANIM_DRINK_SEC,
  poop: PET_ANIM_POOP_SEC,
  petted: PET_ANIM_PETTED_SEC,
  play: PET_ANIM_PLAY_SEC,
};
