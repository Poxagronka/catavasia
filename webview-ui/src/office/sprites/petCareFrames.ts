import type { Pet, SpriteData } from '../types.js';
import { Direction } from '../types.js';
import type { PetSpriteFrames } from './petSpriteData.js';

/**
 * Care poses for a cat pet, derived from the cat's OWN sprite sheet so every
 * cat (bundled or a custom one from an external asset dir) gets them with no
 * extra art. Each pose lowers or squashes a region of an existing frame and
 * re-outlines the seam it opens:
 *
 * - eat / drink: the head (front ~40 % of the side view) dips into the bowl;
 *   drink adds a lapping tongue.
 * - poop: the rear half settles onto the hind legs (squat).
 * - petted: the front view squashes down one pixel under the hand.
 * - play: the side walk cycle with a hop.
 * - sleep: the front view settles low (a loaf), breathing one pixel.
 *
 * Side poses face right; callers flip them for left, like the walk cycle.
 */
export interface PetCarePoses {
  eatRight: SpriteData[];
  drinkRight: SpriteData[];
  poopRight: SpriteData[];
  eatDown: SpriteData[];
  eatUp: SpriteData[];
  petted: SpriteData[];
  playRight: SpriteData[];
  sleep: SpriteData[];
}

/** Lapping tongue color. */
const TONGUE = '#ff8fa8';
/** Fraction of the side-view width that is head. */
const HEAD_FRACTION = 0.4;
/** Fraction of the side-view width that is rump. */
const RUMP_FRACTION = 0.45;
/** Side view: where the back starts (above it: ears, tail) and the legs start. */
const BACK_FRACTION = 0.3;
const LEG_FRACTION = 0.75;
/** Columns of tail root kept in place when the rump squats. */
const TAIL_ROOT_PX = 3;
/** Fraction of the body height above the legs. */
const BODY_FRACTION = 0.6;
/** Hop heights (px) of the play cycle. */
const PLAY_HOPS = [0, 2, 3, 2];

interface Box {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function bbox(s: SpriteData): Box {
  const box = { minX: Infinity, maxX: -1, minY: Infinity, maxY: -1 };
  s.forEach((row, y) =>
    row.forEach((px, x) => {
      if (!px) return;
      box.minX = Math.min(box.minX, x);
      box.maxX = Math.max(box.maxX, x);
      box.minY = Math.min(box.minY, y);
      box.maxY = Math.max(box.maxY, y);
    }),
  );
  return box;
}

/** Most common color on the sprite's silhouette edge: its outline. */
function outlineColor(s: SpriteData): string {
  const counts = new Map<string, number>();
  s.forEach((row, y) =>
    row.forEach((px, x) => {
      if (!px) return;
      const edge = !s[y - 1]?.[x] || !s[y + 1]?.[x] || !row[x - 1] || !row[x + 1];
      if (edge) counts.set(px, (counts.get(px) ?? 0) + 1);
    }),
  );
  let best = '';
  let bestN = 0;
  for (const [c, n] of counts) if (n > bestN) [best, bestN] = [c, n];
  return best;
}

/**
 * Move the pixels of [x0..x1] × [y0..y1) down by `dy`. Vacated cells clear;
 * moved pixels overwrite whatever lies below. Columns x0-1..x0 and x1..x1+1
 * are then re-outlined so the seam does not show the fill color.
 */
function lower(
  s: SpriteData,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  dy: number,
): SpriteData {
  const out = s.map((row) => [...row]);
  if (dy <= 0) return out;
  for (let x = x0; x <= x1; x++) for (let y = y0; y < y1; y++) out[y][x] = '';
  for (let x = x0; x <= x1; x++) {
    for (let y = y1 - 1; y >= y0; y--) {
      const px = s[y][x];
      if (px && y + dy < out.length) out[y + dy][x] = px;
    }
  }
  const ol = outlineColor(s);
  for (const x of [x0 - 1, x0, x1, x1 + 1]) {
    if (x < 0 || x >= out[0].length) continue;
    for (let y = 0; y < out.length; y++) {
      if (!out[y][x]) continue;
      const open = !out[y - 1]?.[x] || !out[y][x - 1] || !out[y][x + 1];
      if (open) out[y][x] = ol;
    }
  }
  return out;
}

/** Pad a sprite with transparent rows: `top` above, `bottom` below. */
function pad(s: SpriteData, top: number, bottom: number): SpriteData {
  const blank = () => new Array<string>(s[0].length).fill('');
  return [
    ...Array.from({ length: top }, blank),
    ...s.map((r) => [...r]),
    ...Array.from({ length: bottom }, blank),
  ];
}

function headDip(side: SpriteData, dy: number): SpriteData {
  const b = bbox(side);
  const w = b.maxX - b.minX + 1;
  const cut = b.minY + Math.round((b.maxY - b.minY + 1) * BODY_FRACTION);
  return lower(side, b.maxX - Math.round(w * HEAD_FRACTION) + 1, b.maxX, b.minY, cut, dy);
}

function withTongue(s: SpriteData): SpriteData {
  const out = s.map((r) => [...r]);
  const b = bbox(s);
  // The mouth is the lowest pixel of the frontmost column; the tongue laps below it.
  for (let y = b.maxY; y >= b.minY; y--) {
    if (out[y][b.maxX] && y + 1 < out.length) {
      out[y + 1][b.maxX] = TONGUE;
      break;
    }
  }
  return out;
}

/**
 * Squat: the rump (rear ~45 %, minus the tail root) settles onto the hind
 * legs. The tail rows above the back stay put, so the tail stays raised.
 */
function squat(side: SpriteData, dy: number): SpriteData {
  const b = bbox(side);
  const w = b.maxX - b.minX + 1;
  const h = b.maxY - b.minY + 1;
  const backTop = b.minY + Math.round(h * BACK_FRACTION);
  const legTop = b.minY + Math.round(h * LEG_FRACTION);
  const x0 = b.minX + TAIL_ROOT_PX;
  return lower(side, x0, b.minX + Math.round(w * RUMP_FRACTION) - 1, backTop, legTop, dy);
}

function frontDip(front: SpriteData, dy: number): SpriteData {
  const b = bbox(front);
  const cut = b.minY + Math.round((b.maxY - b.minY + 1) * BODY_FRACTION);
  return lower(front, b.minX, b.maxX, b.minY, cut, dy);
}

/** Shift a whole sprite `dx` px sideways (the purr shiver). */
function shiftX(s: SpriteData, dx: number): SpriteData {
  return s.map((row) => row.map((_, x) => row[x - dx] ?? ''));
}

/**
 * Digging in the litter: the front legs (front 40 %, bottom quarter) scrape
 * one pixel back or forward.
 */
function dig(side: SpriteData, dx: number): SpriteData {
  const b = bbox(side);
  const w = b.maxX - b.minX + 1;
  const legTop = b.minY + Math.round((b.maxY - b.minY + 1) * LEG_FRACTION);
  const x0 = b.maxX - Math.round(w * HEAD_FRACTION) + 1;
  const out = side.map((row) => [...row]);
  for (let y = legTop; y <= b.maxY; y++) {
    for (let x = x0; x <= b.maxX; x++) out[y][x] = '';
    for (let x = x0; x <= b.maxX; x++) {
      const px = side[y][x];
      if (px && out[y][x + dx] !== undefined) out[y][x + dx] = px;
    }
  }
  return out;
}

export function buildCarePoses(p: PetSpriteFrames): PetCarePoses {
  // Pet sheets author no side idle, so the first walk frame is the side pose.
  const side = p.walkRight[0];
  const maxHop = Math.max(...PLAY_HOPS);
  const hop = (s: SpriteData, h: number) => pad(s, maxHop - h, h);
  const bite = headDip(side, 4);
  const chew = headDip(side, 2);
  const lap = withTongue(headDip(side, 4));
  const front = p.idleDown[0];
  const purr = frontDip(front, 1);
  const crouch = hop(squat(headDip(side, 2), 1), 0);
  return {
    // Crunch: dip, bite, lift the head and chew, dip again (0.25 s per frame).
    eatRight: [bite, headDip(side, 3), bite, chew, chew, bite, headDip(side, 3), bite],
    // Lap, lap, lap: the tongue flicks, the head stays down.
    drinkRight: [lap, bite, lap, bite, lap, headDip(side, 3)],
    // Dig a hole, squat, then scrape the litter back over it.
    poopRight: [
      dig(side, -1),
      dig(side, 1),
      dig(side, -1),
      dig(side, 1),
      squat(side, 3),
      squat(side, 4),
      squat(side, 4),
      squat(side, 4),
      dig(side, 1),
      dig(side, -1),
      dig(side, 1),
      dig(side, -1),
    ],
    eatDown: [frontDip(front, 2), frontDip(front, 3), frontDip(front, 2), frontDip(front, 1)],
    eatUp: [frontDip(p.idleUp[0], 1), frontDip(p.idleUp[0], 2)],
    // Purring under the hand: settled low, the body shivers.
    petted: [purr, shiftX(purr, 1), purr, shiftX(purr, -1), purr, front],
    // Play: crouch, wiggle, pounce (a long leap), land, a few happy hops.
    playRight: [
      crouch,
      hop(squat(headDip(side, 2), 2), 0),
      crouch,
      hop(squat(headDip(side, 2), 2), 0),
      hop(shiftX(p.walkRight[1], 1), 4),
      hop(shiftX(p.walkRight[2], 2), 3),
      hop(headDip(side, 1), 0),
      ...PLAY_HOPS.map((h, i) => hop(p.walkRight[i % 3], h)),
    ],
    sleep: [frontDip(front, 3), frontDip(front, 3), frontDip(front, 4)],
  };
}

const cache = new WeakMap<PetSpriteFrames, PetCarePoses>();
const flipCache = new WeakMap<SpriteData, SpriteData>();

/** Cached poses: the renderer's sprite cache keys on object identity. */
export function getCarePoses(p: PetSpriteFrames): PetCarePoses {
  let poses = cache.get(p);
  if (!poses) {
    poses = buildCarePoses(p);
    cache.set(p, poses);
  }
  return poses;
}

function flipped(s: SpriteData): SpriteData {
  let f = flipCache.get(s);
  if (!f) {
    f = s.map((row) => [...row].reverse());
    flipCache.set(s, f);
  }
  return f;
}

/** The sprite for a pet's current care pose, or null when it plays none. */
export function careSpriteFor(pet: Pet, sprites: PetSpriteFrames): SpriteData | null {
  if (!pet.careAnim) return null;
  const poses = getCarePoses(sprites);
  const pick = (frames: SpriteData[]) => frames[pet.careAnim!.frame % frames.length];
  const side = (frames: SpriteData[]) =>
    pet.dir === Direction.LEFT ? flipped(pick(frames)) : pick(frames);
  switch (pet.careAnim.kind) {
    case 'eat':
    case 'drink': {
      if (pet.dir === Direction.DOWN) return pick(poses.eatDown);
      if (pet.dir === Direction.UP) return pick(poses.eatUp);
      return side(pet.careAnim.kind === 'eat' ? poses.eatRight : poses.drinkRight);
    }
    case 'poop':
      return side(poses.poopRight);
    case 'petted':
      return pick(poses.petted);
    case 'play':
      return side(poses.playRight);
    case 'sleep':
      return pick(poses.sleep);
  }
}
