/**
 * Idle activities: what a cat does while its agent is not working.
 *
 * Every activity is one entry in IDLE_ACTIVITIES. An activity names the
 * furniture it happens at (through its spot builders), how long it lasts and
 * which idle frames it plays (sheet frames 7.., see scripts/cats/). A new
 * activity — a toy, say — plugs in with one more entry: no FSM change.
 *
 * Pure module: no DOM, no OfficeState. The FSM lives in characters.ts.
 */

import type { CatPersonality } from '../../../../core/src/messages.js';
import type { ActivitySpot } from '../types.js';
import type { AnimParts } from './activityAnim.js';
import type { SpotContext } from './activitySpots.js';
import { adjacentSpots, floorNear, itemsOfType, seatSpots } from './activitySpots.js';
import { BED_ACTIVITIES } from './bedActivities.js';
import { COFFEE_ACTIVITIES } from './coffeeActivities.js';
import { GROOM, LOAF, NAP, SIP, STRETCH, TAIL_CHASE, YAWN } from './idleAnims.js';
import { LITTER_ACTIVITIES } from './litterActivities.js';
import { activityMul } from './personality.js';
import { SKILL_READ } from './skillReading.js';
import { TOY_ACTIVITIES } from './toyActivities.js';

export interface IdleActivityDef extends AnimParts {
  id: string;
  /** Relative chance in the weighted pick. */
  weight: number;
  /** Seconds at the spot: [min, max]. */
  durationSec: readonly [number, number];
  /** Where it happens. Omitted: a spotless activity (wander). */
  spots?: (ctx: SpotContext) => ActivitySpot[];
  /** Tried only when every spot is taken (sleep: the floor near a sofa). */
  fallbackSpots?: (ctx: SpotContext) => ActivitySpot[];
  /** Floating "Zzz" while doing it. */
  zzz?: boolean;
  /** The pose is this many px lower than standing: bubbles follow it down. */
  lowPosePx?: number;
  /** Play the walk cycle instead of idle frames (running through a tunnel). */
  walkAnim?: boolean;
  /** The toy moves while in use: yarn rolls, a feather sways, a mouse darts. */
  prop?: PropMotion;
  /** Runs while the agent works and plays to its end (reading a skill). Never picked idle. */
  work?: boolean;
  /** Activity that starts when this one ends (coffee: brew, sip, bring the cup back). */
  next?: string;
  /** The cat walks here with a mug in its paws. */
  carry?: boolean;
  /** Done on the tile the cat stands on: facing the viewer, or to a side. */
  inPlace?: 'front' | 'side';
  /** The walk there is a sprint (zoomies): faster, with speed lines. */
  sprint?: boolean;
  /** The spot hides the cat (a hooded box) only on steps marked `hide`; else always. */
  peekOnHide?: boolean;
}

export type PropMotion = 'roll' | 'sway' | 'dart';

/** Spots of every activity, rebuilt with the layout. */
export interface ActivitySpotSet {
  spots: ActivitySpot[];
  fallback: ActivitySpot[];
}

const COFFEE_TYPES = ['COFFEE'] as const;
const SOFA_TYPES = ['SOFA_FRONT', 'SOFA_BACK', 'SOFA_SIDE'] as const;

export const IDLE_ACTIVITIES: IdleActivityDef[] = [
  {
    // The pre-existing idle behaviour: a few random walks, then a rest at the desk.
    id: 'wander',
    weight: 3,
    durationSec: [0, 0],
    loop: [],
  },
  {
    // A cup someone left on a table (the COFFEE item): the brew chain is the main coffee idle.
    id: 'coffee',
    weight: 1,
    durationSec: [8, 16],
    ...SIP,
    spots: (ctx) => adjacentSpots(ctx, itemsOfType(ctx, COFFEE_TYPES)),
  },
  {
    id: 'sleep',
    weight: 2,
    durationSec: [25, 60],
    ...NAP,
    spots: (ctx) => seatSpots(ctx, itemsOfType(ctx, SOFA_TYPES), true),
    fallbackSpots: (ctx) => floorNear(ctx, itemsOfType(ctx, SOFA_TYPES)),
    zzz: true,
    lowPosePx: 12,
  },
  ...COFFEE_ACTIVITIES,
  // In place, wherever the cat stands.
  { id: 'groom', weight: 1, durationSec: [5, 9], ...GROOM, inPlace: 'front' },
  { id: 'yawn', weight: 0.6, durationSec: [0, 0], ...YAWN, inPlace: 'front' },
  { id: 'stretch', weight: 0.8, durationSec: [0, 0], ...STRETCH, inPlace: 'side' },
  { id: 'tailChase', weight: 0.5, durationSec: [2, 3], ...TAIL_CHASE, inPlace: 'side' },
  { id: 'loaf', weight: 1, durationSec: [10, 20], ...LOAF, inPlace: 'front' },
  ...TOY_ACTIVITIES,
  ...BED_ACTIVITIES,
  ...LITTER_ACTIVITIES,
  SKILL_READ,
];

export function getIdleActivity(id: string | undefined | null): IdleActivityDef | undefined {
  return id ? IDLE_ACTIVITIES.find((d) => d.id === id) : undefined;
}

export function buildActivitySpots(
  ctx: SpotContext,
  defs: readonly IdleActivityDef[] = IDLE_ACTIVITIES,
): Map<string, ActivitySpotSet> {
  const map = new Map<string, ActivitySpotSet>();
  for (const def of defs) {
    if (!def.spots) continue;
    map.set(def.id, { spots: def.spots(ctx), fallback: def.fallbackSpots?.(ctx) ?? [] });
  }
  return map;
}

export interface IdleChoice {
  def: IdleActivityDef;
  spot: ActivitySpot | null;
}

function pickRandom<T>(items: T[], rand: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(rand() * items.length))];
}

/**
 * Weighted random pick of the next activity. Skips activities with no free
 * spot (falling back to fallbackSpots), and never repeats `lastId` twice in a
 * row unless nothing else is available.
 */
export function chooseIdleActivity(
  lastId: string | null,
  spotSets: Map<string, ActivitySpotSet>,
  taken: Set<string>,
  rand: () => number = Math.random,
  defs: readonly IdleActivityDef[] = IDLE_ACTIVITIES,
  personality?: CatPersonality,
): IdleChoice | null {
  const weight = (def: IdleActivityDef) => def.weight * activityMul(personality, def.id);
  const options: IdleChoice[] = [];
  const spotsFor = new Map<string, ActivitySpot[]>();
  for (const def of defs) {
    if (def.work || def.weight <= 0) continue;
    if (!def.spots) {
      options.push({ def, spot: null });
      continue;
    }
    const set = spotSets.get(def.id);
    if (!set) continue;
    const isFree = (s: ActivitySpot) =>
      !taken.has(s.key) && !(s.exit && taken.has(`${s.exit.col},${s.exit.row}`));
    let free = set.spots.filter(isFree);
    if (free.length === 0) free = set.fallback.filter(isFree);
    if (free.length === 0) continue;
    spotsFor.set(def.id, free);
    options.push({ def, spot: null });
  }
  const fresh = options.filter((o) => o.def.id !== lastId);
  const pool = fresh.length > 0 ? fresh : options;
  const total = pool.reduce((sum, o) => sum + weight(o.def), 0);
  if (pool.length === 0 || total <= 0) return null;
  let roll = rand() * total;
  let chosen = pool[pool.length - 1];
  for (const o of pool) {
    roll -= weight(o.def);
    if (roll < 0) {
      chosen = o;
      break;
    }
  }
  const free = spotsFor.get(chosen.def.id);
  return { def: chosen.def, spot: free ? pickRandom(free, rand) : null };
}

/** Px a toy prop is drawn off its place at time `t` (seconds) while in use. */
export function propOffset(motion: PropMotion, t: number): { dx: number; dy: number } {
  switch (motion) {
    case 'roll':
      return { dx: Math.round(2 * Math.sin(t * 2.2)), dy: 0 };
    case 'sway':
      return { dx: Math.round(1.5 * Math.sin(t * 5)), dy: Math.round(Math.sin(t * 2.5)) };
    case 'dart':
      return { dx: Math.round(3 * Math.sin(t * 2.3)), dy: Math.round(1.5 * Math.sin(t * 3.7)) };
  }
}
