/**
 * Play animations of a cat pet at the office's toys and beds: the pet's
 * version of the agent cats' activity steps (toyAnims.ts). Each step names a
 * derived pet pose (sprites/petPlayFrames.ts), how long it holds, how far the
 * pose and the toy move, the toy's animation frame and an effect. The pet
 * care runtime (petCareSystem.ts) only counts time; this module turns that
 * time into a step, a sprite and offsets, for the renderer and the preview.
 *
 * Orientation: steps are written for a cat facing right at a side spot, or
 * facing the viewer on an item. The spot (turned by layout/itemFrame.ts) sets
 * the facing; a LEFT facing flips the pose, its dx and the toy's px; a
 * mirrored item flips a front-view pose.
 *
 * Pure module: no DOM.
 */

import type { PetPoseName } from '../sprites/petPlayFrames.js';
import { getPlayPoses } from '../sprites/petPlayFrames.js';
import type { PetSpriteFrames } from '../sprites/petSpriteData.js';
import type { Pet, PetPlayAnim, SpriteData } from '../types.js';
import { Direction, TILE_SIZE } from '../types.js';
import type { FxDrawable, FxKind } from './activityFx.js';
import { fxDrawables } from './activityFx.js';

export interface PetStep {
  /** A derived pose, or 'run': the walk cycle along the tunnel. */
  pose: PetPoseName | 'run';
  sec: number;
  /** Px the pose is drawn off the spot (toward the facing for dx). */
  dx?: number;
  dy?: number;
  /** Px the toy in use is drawn off its place (toward the facing for px). */
  px?: number;
  py?: number;
  /** Animation frame of the item in use (the yarn ball's stripes turn). */
  item?: number;
  fx?: FxKind;
  /** Px of the effect from the pose's anchor (bottom-centre): x toward the facing, y up negative. */
  fxAt?: readonly [number, number];
  /** 'run' steps: toward the far end, or back to the spot. */
  run?: 'out' | 'back';
}

export interface PetAnim {
  intro?: readonly PetStep[];
  loop: readonly PetStep[];
  outro?: readonly PetStep[];
  /** The whole animation plays once, start to end: the claim lasts exactly its length. */
  fixed?: boolean;
  /**
   * Px every step is drawn off the spot: the spots are the agent cats' (a
   * 16 px pose standing a little lower), a pet's side pose is wider.
   */
  base?: { dx: number; dy: number };
}

const s = (pose: PetStep['pose'], sec: number, extra: Omit<PetStep, 'pose' | 'sec'> = {}) => ({
  pose,
  sec,
  ...extra,
});
const wiggle = (n: number, sec = 0.12): PetStep[] =>
  Array.from({ length: n * 2 }, (_, i) => s(i % 2 ? 'wiggle' : 'crouch', sec));

/** Where the paws rake the post, and a sparkle over the head. */
const CLAWS: readonly [number, number] = [9, -15];
const ABOVE: readonly [number, number] = [2, -20];
/** The perch on the cat tree's top (on top of the spot's own offset). */
const ON_TOP = 1;
/** Pets stand on the tile centre line; a pose at a floor toy settles onto the toy's base. */
const ON_FLOOR = 5;

export const PET_PLAY_ANIMS: Readonly<Record<PetPlayAnim, PetAnim>> = {
  scratch: {
    base: { dx: -5, dy: ON_FLOOR },
    intro: [s('stand', 0.4), s('rear', 0.5)],
    loop: [
      s('scratchA', 0.15, { fx: 'scratch', fxAt: CLAWS }),
      s('scratchB', 0.15, { dy: 1, fx: 'scratch', fxAt: CLAWS }),
      s('scratchA', 0.15, { fx: 'scratch', fxAt: CLAWS }),
      s('scratchB', 0.15, { dy: 1, fx: 'scratch', fxAt: CLAWS }),
      s('scratchA', 0.15, { fx: 'scratch', fxAt: CLAWS }),
      s('scratchB', 0.2, { dy: 1, fx: 'scratch', fxAt: CLAWS }),
      s('rear', 0.6, { fx: 'fur', fxAt: [6, -10] }),
      s('reach', 0.5),
    ],
    outro: [s('stand', 0.6)],
  },
  yarn: {
    base: { dx: -2, dy: ON_FLOOR },
    intro: [s('crouch', 0.5), ...wiggle(2)],
    loop: [
      s('crouch', 0.4),
      ...wiggle(2, 0.1),
      s('windup', 0.22),
      // Batted away: the ball rolls out, its stripes turning (item frames 1-3)...
      s('bat', 0.08, { px: 1, item: 1 }),
      s('bat', 0.1, { px: 3, item: 2 }),
      s('crouch', 0.1, { px: 5, item: 3 }),
      s('crouch', 0.12, { px: 6 }),
      s('crouch', 0.3, { px: 7, item: 1 }),
      s('windup', 0.15, { px: 7, item: 1 }),
      // ...and the swipe back rolls it home.
      s('bat', 0.1, { px: 5, item: 3 }),
      s('bat', 0.1, { px: 3, item: 2 }),
      s('crouch', 0.1, { px: 1, item: 1 }),
      s('stand', 1.0, { fx: 'sparkle', fxAt: ABOVE }),
    ],
  },
  mouse: {
    base: { dx: -2, dy: ON_FLOOR },
    intro: [s('crouch', 0.6)],
    loop: [
      s('crouch', 0.5, { py: -1 }),
      s('crouch', 0.3),
      ...wiggle(3, 0.1),
      s('pounce', 0.12, { dy: -3, dx: 1, px: 1 }),
      s('pounce', 0.1, { dy: -2, dx: 3, px: 1 }),
      s('pin', 0.5, { dx: 4, px: 1, fx: 'dust', fxAt: [10, -1] }),
      s('stand', 0.9, { dx: 4, px: 1, fx: 'sparkle', fxAt: ABOVE }),
      s('pin', 0.3, { dx: 4, px: 1 }),
      s('crouch', 0.2, { dx: 3, px: 1 }),
      s('crouch', 0.2, { dx: 2 }),
      s('crouch', 0.2, { dx: 1 }),
      s('crouch', 0.3),
    ],
  },
  teaser: {
    base: { dx: -2, dy: ON_FLOOR },
    intro: [s('stand', 0.5), s('rear', 0.4)],
    loop: [
      s('rear', 0.5),
      s('reach', 0.3),
      s('bat', 0.15),
      s('reach', 0.12),
      s('bat', 0.15),
      s('reach', 0.12),
      s('pounce', 0.12, { dy: -2 }),
      s('pounce', 0.14, { dy: -3 }),
      s('pounce', 0.1, { dy: -1 }),
      s('crouch', 0.5),
      s('stand', 0.7),
    ],
  },
  box: {
    base: { dx: 0, dy: -12 },
    // The base lifts the head onto the rim; a hop in or out is a whole cat over the box.
    intro: [
      s('pounce', 0.1, { dy: 2 }),
      s('pounce', 0.1, { dy: 6 }),
      s('boxPeek', 0.25),
      s('boxLow', 0.5),
    ],
    loop: [
      s('boxLow', 1.5),
      s('boxPeek', 0.8),
      s('boxLookL', 0.7),
      s('boxLookR', 0.7),
      s('boxPeek', 0.4),
      s('boxLow', 1.2),
    ],
    outro: [s('boxPeek', 0.3), s('pounce', 0.1, { dy: 6 }), s('pounce', 0.1, { dy: 10 })],
  },
  catTree: {
    intro: [
      s('climbA', 0.16, { dy: 31 }),
      s('climbB', 0.16, { dy: 25 }),
      s('climbA', 0.16, { dy: 19 }),
      s('climbB', 0.16, { dy: 13 }),
      s('climbA', 0.16, { dy: 7 }),
      s('perch', 0.4, { dy: ON_TOP }),
    ],
    loop: [
      s('perch', 1.0, { dy: ON_TOP }),
      s('perchL', 0.45, { dy: ON_TOP }),
      s('perch', 0.35, { dy: ON_TOP }),
      s('perchR', 0.45, { dy: ON_TOP }),
      s('perch', 1.2, { dy: ON_TOP }),
    ],
    outro: [
      s('pounce', 0.1, { dy: 8 }),
      s('pounce', 0.1, { dy: 18 }),
      s('pounce', 0.12, { dy: 28, fx: 'dust', fxAt: [0, 28] }),
    ],
  },
  tunnel: {
    base: { dx: 0, dy: ON_FLOOR },
    fixed: true,
    intro: [s('crouch', 0.3), ...wiggle(2)],
    loop: Array.from({ length: 6 }, (_, i) => s('run', 1, { run: i % 2 ? 'back' : 'out' })),
    outro: [s('stand', 0.9, { fx: 'sparkle', fxAt: ABOVE })],
  },
  curl: {
    base: { dx: 0, dy: 0 },
    loop: [s('curlA', 1.4), s('curlB', 1.4)],
  },
};

const partSec = (steps: readonly PetStep[] = []) => steps.reduce((sum, st) => sum + st.sec, 0);

/** Seconds of a fixed animation (the tunnel): the claim lasts exactly this. */
export function petPlaySec(kind: PetPlayAnim): number {
  const a = PET_PLAY_ANIMS[kind];
  return partSec(a.intro) + partSec(a.loop) + partSec(a.outro);
}

function stepIn(steps: readonly PetStep[], t: number): { step: PetStep; stepT: number } {
  let left = t;
  for (const st of steps) {
    if (left < st.sec) return { step: st, stepT: left };
    left -= st.sec;
  }
  const last = steps[steps.length - 1];
  return { step: last, stepT: last.sec };
}

/**
 * The step at `t` seconds of a `dur`-second play: the intro once, the loop
 * repeated, the outro over the last seconds (when there is room for it).
 */
export function petPlayStep(
  kind: PetPlayAnim,
  t: number,
  dur: number,
): { step: PetStep; stepT: number } {
  const a = PET_PLAY_ANIMS[kind];
  const intro = partSec(a.intro);
  const outro = partSec(a.outro);
  if (a.intro && t < intro) return stepIn(a.intro, t);
  if (a.outro && t >= dur - outro && dur - outro >= intro)
    return stepIn(a.outro, t - (dur - outro));
  const loop = partSec(a.loop);
  return stepIn(a.loop, a.fixed ? t - intro : (t - intro) % loop);
}

export function isPetPlayAnim(kind: string | undefined): kind is PetPlayAnim {
  return kind !== undefined && kind in PET_PLAY_ANIMS;
}

export interface PetPlayView {
  sprite: SpriteData;
  /** Px off the pet's anchor (rest offset included). */
  x: number;
  y: number;
  /** Inside the tunnel: not drawn. */
  hidden: boolean;
  dir: Direction;
  step: PetStep;
  stepT: number;
}

/** Px of a tunnel end the pet stays visible in before it vanishes inside (runThrough.ts). */
const VISIBLE_LIP_PX = 2;
const flipCache = new WeakMap<SpriteData, SpriteData>();

function flipped(sp: SpriteData): SpriteData {
  let f = flipCache.get(sp);
  if (!f) {
    f = sp.map((row) => [...row].reverse());
    flipCache.set(sp, f);
  }
  return f;
}

/** What a pet in a play pose draws now, or null when it plays none. */
export function petPlayView(pet: Pet, sprites: PetSpriteFrames): PetPlayView | null {
  const anim = pet.careAnim;
  if (!anim || !isPetPlayAnim(anim.kind)) return null;
  const { step, stepT } = petPlayStep(anim.kind, anim.t ?? 0, anim.dur ?? Infinity);
  const rest = pet.rest;
  const base = PET_PLAY_ANIMS[anim.kind].base ?? { dx: 0, dy: 0 };
  let x = rest?.offsetX ?? 0;
  let y = (rest?.offsetY ?? 0) + base.dy;
  let dir = pet.dir;
  if (step.pose === 'run') {
    const exit = rest?.exit ?? { dx: 0, dy: 0 };
    const p = Math.min(1, stepT / step.sec);
    const k = step.run === 'back' ? 1 - p : p;
    const toward = step.run === 'back' ? -1 : 1;
    if (exit.dx !== 0) dir = exit.dx * toward > 0 ? Direction.RIGHT : Direction.LEFT;
    else dir = exit.dy * toward > 0 ? Direction.DOWN : Direction.UP;
    x += exit.dx * k;
    y += exit.dy * k;
    const len = Math.abs(exit.dx) + Math.abs(exit.dy);
    const along = len * k;
    const lip = TILE_SIZE / 2 - VISIBLE_LIP_PX;
    const frames =
      dir === Direction.DOWN
        ? sprites.walkDown
        : dir === Direction.UP
          ? sprites.walkUp
          : dir === Direction.LEFT
            ? sprites.walkLeft
            : sprites.walkRight;
    const sprite = frames[Math.floor(stepT / 0.1) % 3];
    return { sprite, x, y, hidden: along > lip && along < len - lip, dir, step, stepT };
  }
  const pose = getPlayPoses(sprites)[step.pose];
  const side = dir === Direction.LEFT || dir === Direction.RIGHT;
  let sprite = side
    ? pose.side
    : dir === Direction.UP
      ? (pose.up ?? pose.side)
      : (pose.down ?? pose.side);
  // A side pose turns left by a flip; a front-view pose flips with a mirrored item.
  const flip = side ? dir === Direction.LEFT : !!rest?.mirrored && sprite === pose.side;
  if (flip) sprite = flipped(sprite);
  const sign = dir === Direction.LEFT || (!side && rest?.mirrored) ? -1 : 1;
  x += ((step.dx ?? 0) + base.dx) * sign;
  y += step.dy ?? 0;
  return { sprite, x, y, hidden: false, dir, step, stepT };
}

/** Effects of the pet's play step (claw marks, sparkles, the tunnel's rustle), in world px. */
export function petPlayFx(pet: Pet, sprites: PetSpriteFrames | null): FxDrawable[] {
  const v = sprites ? petPlayView(pet, sprites) : null;
  if (!v) return [];
  const zY = pet.y + TILE_SIZE / 2 + 0.6;
  if (v.hidden) {
    const at = {
      x: Math.round(pet.x + v.x) - 1,
      y: Math.round(pet.y + v.y) - 5,
      mirror: false,
      zY,
    };
    return fxDrawables('rustle', at, (pet.x + v.x) / 8);
  }
  if (!v.step.fx) return [];
  const [fx, fy] = v.step.fxAt ?? ABOVE;
  const mirror = v.dir === Direction.LEFT;
  const at = { x: pet.x + v.x + (mirror ? -fx : fx), y: pet.y + v.y + fy, mirror, zY };
  return fxDrawables(v.step.fx, at, v.stepT);
}

/** How the pet's toy moves now: px off its place and its frame, or null. */
export function petToyMotion(
  pet: Pet,
  sprites: PetSpriteFrames | null,
): { dx: number; dy: number; item?: number; hidden: boolean } | null {
  const v = sprites ? petPlayView(pet, sprites) : null;
  if (!v) return null;
  if (v.hidden) return { dx: 0, dy: Math.floor((pet.x + v.x) / 3) % 2 ? -1 : 0, hidden: true };
  const flip = v.dir === Direction.LEFT ? -1 : 1;
  return { dx: (v.step.px ?? 0) * flip, dy: v.step.py ?? 0, item: v.step.item, hidden: false };
}
