import type { SpriteData } from '../types.js';
import type { Box } from './petCareFrames.js';
import { bbox, dig, frontDip, headDip, lower, shiftX, squat } from './petCareFrames.js';
import type { PetSpriteFrames } from './petSpriteData.js';

/**
 * Play poses of a cat pet at the office's toys, beds and boxes, derived from
 * the cat's OWN sheet like the care poses (petCareFrames.ts): every coat and
 * every custom pet from an external asset dir gets them with no extra art.
 *
 * - rear / scratch: the body tilts up on the hind legs (a shear), the front
 *   paws rake up and down the post.
 * - bat / reach: the front legs swing forward, or up at a feather.
 * - curl: the body settles flat onto the floor, the head on the paws.
 * - box: only the head shows above the rim (the rest is cut away).
 * - climb: the back view, used on the cat tree's post.
 *
 * Each pose has a side view (facing right; callers flip it for left) and may
 * have a front (`down`) and back (`up`) view. Without one, the side view is
 * used.
 */
export interface DirPose {
  side: SpriteData;
  down?: SpriteData;
  up?: SpriteData;
}

export const PET_POSE_NAMES = [
  'stand',
  'crouch',
  'wiggle',
  'pounce',
  'bat',
  'windup',
  'rear',
  'scratchA',
  'scratchB',
  'reach',
  'pin',
  'curlA',
  'curlB',
  'boxLow',
  'boxPeek',
  'boxLookL',
  'boxLookR',
  'climbA',
  'climbB',
  'perch',
  'perchL',
  'perchR',
] as const;
export type PetPoseName = (typeof PET_POSE_NAMES)[number];
export type PetPlayPoses = Record<PetPoseName, DirPose>;

/** Fraction of the side-view width that is head and front legs (petCareFrames.ts). */
const FRONT_FRACTION = 0.4;
/** Where the legs start, as a fraction of the body height. */
const LEG_FRACTION = 0.75;
/** Where the hind legs stand (the shear pivot), as a fraction of the width from the tail end. */
const PIVOT_FRACTION = 0.45;
/** Shear slopes: px of lift per column ahead of the pivot. 1 at most keeps the outline closed. */
const REAR_SLOPE = 0.6;
const WINDUP_SLOPE = 0.25;
/** Rows of the front view that show above a box rim (ears + eyes, a little more on the peek). */
const BOX_LOW_FRACTION = 0.5;
const BOX_PEEK_FRACTION = 0.65;
/** Rows of the front view that are the head (a perch look turns only these). */
const HEAD_FRACTION = 0.45;

const isEmpty = (b: Box) => b.maxX < 0;

/**
 * Rear up: every column ahead of the hind legs lifts by `slope` px per column,
 * so the body tilts up from the hind feet. Each column moves whole, so its own
 * outline pixels move with it.
 */
function shear(s: SpriteData, slope: number): SpriteData {
  const b = bbox(s);
  if (isEmpty(b)) return s.map((r) => [...r]);
  const pivot = b.minX + Math.round((b.maxX - b.minX + 1) * PIVOT_FRACTION);
  const out = s.map((r) => r.map(() => ''));
  for (let x = 0; x < s[0].length; x++) {
    const lift = x > pivot ? Math.round(slope * (x - pivot)) : 0;
    for (let y = 0; y < s.length; y++) if (s[y][x] && y - lift >= 0) out[y - lift][x] = s[y][x];
  }
  return out;
}

/**
 * A swing of the front legs: the leg pixels of the front part move `dx` px
 * forward and `up` px up, drawn over the body; the belly they leave is
 * re-outlined.
 */
function pawSwing(s: SpriteData, dx: number, up: number): SpriteData {
  const b = bbox(s);
  if (isEmpty(b)) return s.map((r) => [...r]);
  const w = b.maxX - b.minX + 1;
  const x0 = b.maxX - Math.round(w * FRONT_FRACTION) + 1;
  const legTop = b.minY + Math.round((b.maxY - b.minY + 1) * LEG_FRACTION);
  const out = s.map((r) => [...r]);
  const legs: Array<[number, number, string]> = [];
  for (let y = legTop; y <= b.maxY; y++)
    for (let x = x0; x <= b.maxX; x++) {
      if (!s[y][x]) continue;
      legs.push([x, y, s[y][x]]);
      out[y][x] = '';
    }
  const ol = outlineOf(s);
  // The belly above the lifted legs gets an outline.
  for (let x = x0; x <= b.maxX; x++) if (out[legTop - 1]?.[x]) out[legTop - 1][x] = ol;
  for (const [x, y, px] of legs) {
    const X = x + dx;
    const Y = y - up;
    if (X >= 0 && X < out[0].length && Y >= 0) out[Y][X] = px;
  }
  return out;
}

/** The darkest color on the sprite: its outline. */
function outlineOf(s: SpriteData): string {
  let best = '';
  let bestL = Infinity;
  for (const row of s)
    for (const px of row) {
      if (!px) continue;
      const n = parseInt(px.slice(1, 7), 16);
      const l = (n >> 16) + ((n >> 8) & 255) + (n & 255);
      if (l < bestL) [best, bestL] = [px, l];
    }
  return best;
}

/**
 * Lying down: the body above the legs settles onto the floor (the legs are
 * hidden under it), and the head rests a pixel lower still.
 */
function curl(side: SpriteData, breath: number): SpriteData {
  const b = bbox(side);
  if (isEmpty(b)) return side.map((r) => [...r]);
  const h = b.maxY - b.minY + 1;
  const legTop = b.minY + Math.round(h * LEG_FRACTION);
  const flat = lower(side, b.minX, b.maxX, 0, legTop, b.maxY - legTop + 1);
  const rest = headDip(flat, 1);
  return breath > 0 ? lower(rest, b.minX, b.maxX, 0, b.minY + Math.round(h * 0.6), breath) : rest;
}

/**
 * Only the top `fraction` of the sprite (the head), moved down to the canvas
 * bottom: drawn at the rim of a box, the rest of the cat is inside it.
 */
function headOnly(s: SpriteData, fraction: number): SpriteData {
  const b = bbox(s);
  const out = s.map((r) => r.map(() => ''));
  if (isEmpty(b)) return out;
  const keep = Math.max(1, Math.round((b.maxY - b.minY + 1) * fraction));
  const drop = s.length - (b.minY + keep);
  for (let y = b.minY; y < b.minY + keep; y++) out[y + drop] = [...s[y]];
  return out;
}

/** The head (top rows) of a front view turned `dx` px (a look to one side). */
function headTurn(s: SpriteData, dx: number): SpriteData {
  const b = bbox(s);
  if (isEmpty(b)) return s.map((r) => [...r]);
  const cut = b.minY + Math.round((b.maxY - b.minY + 1) * HEAD_FRACTION);
  const moved = shiftX(s, dx);
  return s.map((row, y) => (y < cut ? moved[y] : [...row]));
}

export function buildPlayPoses(p: PetSpriteFrames): PetPlayPoses {
  // Pet sheets author no side idle: the first walk frame is the side pose.
  const side = p.walkRight[0];
  const front = p.idleDown[0];
  const back = p.idleUp[0];
  const crouch = squat(headDip(side, 2), 1);
  const rear = shear(side, REAR_SLOPE);
  const loaf = frontDip(front, 2);
  return {
    stand: { side, down: front, up: back },
    crouch: { side: crouch, down: frontDip(front, 2), up: frontDip(back, 2) },
    wiggle: {
      side: squat(headDip(side, 2), 2),
      down: shiftX(frontDip(front, 2), 1),
      up: shiftX(frontDip(back, 2), 1),
    },
    pounce: { side: shiftX(p.walkRight[1], 1), down: p.walkDown[1], up: p.walkUp[1] },
    bat: { side: pawSwing(crouch, 3, 3), down: frontDip(front, 1), up: frontDip(back, 1) },
    windup: { side: shear(crouch, WINDUP_SLOPE), down: loaf, up: frontDip(back, 2) },
    rear: { side: rear, down: front, up: back },
    scratchA: { side: shear(dig(side, -1), REAR_SLOPE) },
    scratchB: { side: shear(dig(side, 1), REAR_SLOPE) },
    reach: { side: shear(pawSwing(side, 1, 3), REAR_SLOPE), down: front, up: back },
    pin: { side: headDip(squat(pawSwing(side, 2, 0), 1), 3), down: loaf, up: frontDip(back, 2) },
    curlA: { side: curl(side, 0) },
    curlB: { side: curl(side, 1) },
    boxLow: { side: headOnly(front, BOX_LOW_FRACTION) },
    boxPeek: { side: headOnly(front, BOX_PEEK_FRACTION) },
    boxLookL: { side: headOnly(shiftX(front, -1), BOX_PEEK_FRACTION) },
    boxLookR: { side: headOnly(shiftX(front, 1), BOX_PEEK_FRACTION) },
    climbA: { side: p.walkUp[0] },
    climbB: { side: p.walkUp[2] },
    perch: { side: loaf },
    perchL: { side: headTurn(loaf, -1) },
    perchR: { side: headTurn(loaf, 1) },
  };
}

const cache = new WeakMap<PetSpriteFrames, PetPlayPoses>();

/** Cached poses: the renderer's sprite cache keys on object identity. */
export function getPlayPoses(p: PetSpriteFrames): PetPlayPoses {
  let poses = cache.get(p);
  if (!poses) {
    poses = buildPlayPoses(p);
    cache.set(p, poses);
  }
  return poses;
}
