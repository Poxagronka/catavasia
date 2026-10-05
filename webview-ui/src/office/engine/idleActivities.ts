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

import { CHARACTER_SITTING_OFFSET_PX } from '../../constants.js';
import { getCatalogEntry } from '../layout/furnitureCatalog.js';
import { isWalkable } from '../layout/tileMap.js';
import type {
  ActivitySpot,
  Character,
  PlacedFurniture,
  Seat,
  TileType as TileTypeVal,
} from '../types.js';
import { Direction } from '../types.js';

/** What spot builders read from the office. */
export interface SpotContext {
  furniture: PlacedFurniture[];
  seats: Map<string, Seat>;
  tileMap: TileTypeVal[][];
  blockedTiles: Set<string>;
}

export interface IdleActivityDef {
  id: string;
  /** Relative chance in the weighted pick. */
  weight: number;
  /** Seconds at the spot: [min, max]. */
  durationSec: readonly [number, number];
  /** Animation: idle frame indices (sheet frame - 7), one per step. */
  frames: readonly number[];
  frameSec: number;
  /** Where it happens. Omitted: a spotless activity (wander). */
  spots?: (ctx: SpotContext) => ActivitySpot[];
  /** Tried only when every spot is taken (sleep: the floor near a sofa). */
  fallbackSpots?: (ctx: SpotContext) => ActivitySpot[];
  /** Floating "Zzz" while doing it. */
  zzz?: boolean;
  /** The pose is this many px lower than standing: bubbles follow it down. */
  lowPosePx?: number;
}

/** Spots of every activity, rebuilt with the layout. */
export interface ActivitySpotSet {
  spots: ActivitySpot[];
  fallback: ActivitySpot[];
}

const NEIGHBORS: ReadonlyArray<{ dc: number; dr: number; facing: Direction }> = [
  { dc: 0, dr: 1, facing: Direction.UP }, // spot below the item faces up
  { dc: 0, dr: -1, facing: Direction.DOWN },
  { dc: -1, dr: 0, facing: Direction.RIGHT },
  { dc: 1, dr: 0, facing: Direction.LEFT },
];

/** Type without the orientation suffix ("SOFA_SIDE:left" -> "SOFA_SIDE"). */
function baseType(type: string): string {
  return type.split(':')[0];
}

/** Furniture of the given types (orientation suffix ignored: "SOFA_SIDE:left" is SOFA_SIDE). */
export function itemsOfType(ctx: SpotContext, types: readonly string[]): PlacedFurniture[] {
  return ctx.furniture.filter((f) => types.includes(baseType(f.type)));
}

function footprint(item: PlacedFurniture): Array<{ col: number; row: number }> {
  const entry = getCatalogEntry(item.type);
  const w = entry?.footprintW ?? 1;
  const h = entry?.footprintH ?? 1;
  const tiles: Array<{ col: number; row: number }> = [];
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) tiles.push({ col: item.col + c, row: item.row + r });
  return tiles;
}

function seatAt(ctx: SpotContext, col: number, row: number): Seat | undefined {
  for (const seat of ctx.seats.values()) {
    if (seat.seatCol === col && seat.seatRow === row) return seat;
  }
  return undefined;
}

/**
 * Tiles next to an item, facing it: free floor, or a seat (a sofa seat at the
 * coffee table). Each tile appears once even when it touches several items.
 */
export function adjacentSpots(ctx: SpotContext, items: PlacedFurniture[]): ActivitySpot[] {
  const out = new Map<string, ActivitySpot>();
  for (const item of items) {
    const own = new Set(footprint(item).map((t) => `${t.col},${t.row}`));
    for (const t of footprint(item)) {
      for (const n of NEIGHBORS) {
        const col = t.col + n.dc;
        const row = t.row + n.dr;
        const key = `${col},${row}`;
        if (own.has(key) || out.has(key)) continue;
        const seat = seatAt(ctx, col, row);
        if (seat) {
          out.set(key, {
            key,
            col,
            row,
            facing: n.facing,
            onFurniture: true,
            seatUid: seat.uid,
            offsetY: CHARACTER_SITTING_OFFSET_PX,
          });
        } else if (isWalkable(col, row, ctx.tileMap, ctx.blockedTiles)) {
          out.set(key, { key, col, row, facing: n.facing, onFurniture: false, offsetY: 0 });
        }
      }
    }
  }
  return [...out.values()];
}

/**
 * Seats of the items (sofa cushions). A seat that faces up sits behind the
 * backrest, which hides a low pose (a curled-up cat): skip those for them.
 */
export function seatSpots(
  ctx: SpotContext,
  items: PlacedFurniture[],
  lowPose = false,
): ActivitySpot[] {
  const uids = new Set(items.map((i) => i.uid));
  const out: ActivitySpot[] = [];
  for (const seat of ctx.seats.values()) {
    if (!uids.has(seat.uid.split(':')[0])) continue;
    if (lowPose && seat.facingDir === Direction.UP) continue;
    out.push({
      key: `${seat.seatCol},${seat.seatRow}`,
      col: seat.seatCol,
      row: seat.seatRow,
      facing: seat.facingDir,
      onFurniture: true,
      seatUid: seat.uid,
      offsetY: CHARACTER_SITTING_OFFSET_PX,
    });
  }
  return out;
}

/** Free floor within one tile of the items (diagonals too). */
export function floorNear(ctx: SpotContext, items: PlacedFurniture[]): ActivitySpot[] {
  const out = new Map<string, ActivitySpot>();
  for (const item of items) {
    for (const t of footprint(item)) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const col = t.col + dc;
          const row = t.row + dr;
          const key = `${col},${row}`;
          if (out.has(key) || !isWalkable(col, row, ctx.tileMap, ctx.blockedTiles)) continue;
          out.set(key, { key, col, row, facing: Direction.DOWN, onFurniture: false, offsetY: 0 });
        }
      }
    }
  }
  return [...out.values()];
}

const COFFEE_TYPES = ['COFFEE'] as const;
const SOFA_TYPES = ['SOFA_FRONT', 'SOFA_BACK', 'SOFA_SIDE'] as const;

/** Sheet frame 7 + index: 0-1 drink (hold, sip), 2-4 nap (out, in, tail flick). */
export const IDLE_ACTIVITIES: IdleActivityDef[] = [
  {
    // The pre-existing idle behaviour: a few random walks, then a rest at the desk.
    id: 'wander',
    weight: 3,
    durationSec: [0, 0],
    frames: [],
    frameSec: 1,
  },
  {
    id: 'coffee',
    weight: 2,
    durationSec: [8, 16],
    frames: [0, 0, 0, 1, 1, 0, 0, 1],
    frameSec: 0.6,
    spots: (ctx) => adjacentSpots(ctx, itemsOfType(ctx, COFFEE_TYPES)),
  },
  {
    id: 'sleep',
    weight: 2,
    durationSec: [25, 60],
    frames: [2, 3, 2, 4],
    frameSec: 0.9,
    spots: (ctx) => seatSpots(ctx, itemsOfType(ctx, SOFA_TYPES), true),
    fallbackSpots: (ctx) => floorNear(ctx, itemsOfType(ctx, SOFA_TYPES)),
    zzz: true,
    lowPosePx: 12,
  },
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

/**
 * Spot keys other characters hold: their activity spots, and seat tiles of
 * seats assigned to someone else (an agent may come back to work there).
 */
export function takenSpotKeys(
  self: Character,
  characters: Iterable<Character>,
  seats: Map<string, Seat>,
): Set<string> {
  const taken = new Set<string>();
  for (const other of characters) {
    if (other === self) continue;
    if (other.activity?.spot) taken.add(other.activity.spot.key);
    if (other.seatId) {
      const seat = seats.get(other.seatId);
      if (seat) taken.add(`${seat.seatCol},${seat.seatRow}`);
    }
  }
  return taken;
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
): IdleChoice | null {
  const options: IdleChoice[] = [];
  const spotsFor = new Map<string, ActivitySpot[]>();
  for (const def of defs) {
    if (!def.spots) {
      options.push({ def, spot: null });
      continue;
    }
    const set = spotSets.get(def.id);
    if (!set) continue;
    let free = set.spots.filter((s) => !taken.has(s.key));
    if (free.length === 0) free = set.fallback.filter((s) => !taken.has(s.key));
    if (free.length === 0) continue;
    spotsFor.set(def.id, free);
    options.push({ def, spot: null });
  }
  const fresh = options.filter((o) => o.def.id !== lastId);
  const pool = fresh.length > 0 ? fresh : options;
  const total = pool.reduce((sum, o) => sum + o.def.weight, 0);
  if (pool.length === 0 || total <= 0) return null;
  let roll = rand() * total;
  let chosen = pool[pool.length - 1];
  for (const o of pool) {
    roll -= o.def.weight;
    if (roll < 0) {
      chosen = o;
      break;
    }
  }
  const free = spotsFor.get(chosen.def.id);
  return { def: chosen.def, spot: free ? pickRandom(free, rand) : null };
}
