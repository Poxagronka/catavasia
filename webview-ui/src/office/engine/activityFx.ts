/**
 * Small effects drawn with an activity step: steam over a mug, a puff when a
 * cat blows on it, hearts, claw marks on a post, falling fur, dust, sparkles,
 * dizzy stars, a page flip, rustle lines, water ripples. Each effect is a list
 * of tiny sprites in world px, so the renderer z-sorts them with the scene and
 * the preview tooling draws the same thing.
 *
 * Pure module: no DOM.
 */

import { ACTIVITY_FX_COLORS } from '../../constants.js';
import type { Character, Direction as DirectionT, SpriteData } from '../types.js';
import { Direction, TILE_SIZE } from '../types.js';
import { activityStep, characterDrawOffsetX, characterDrawOffsetY } from './characters.js';
import { isHiddenInRunThrough } from './runThrough.js';

export type FxKind =
  | 'steam'
  | 'blow'
  | 'hearts'
  | 'scratch'
  | 'fur'
  | 'dust'
  | 'sparkle'
  | 'dizzy'
  | 'page'
  | 'rustle'
  | 'ripple'
  | 'crumbs';

export interface FxDrawable {
  sprite: SpriteData;
  /** World px of the sprite's top-left. */
  x: number;
  y: number;
  zY: number;
  alpha: number;
}

/** Where an effect starts: world px, and whether the pose is mirrored (facing left). */
export interface FxAnchor {
  x: number;
  y: number;
  mirror: boolean;
  zY: number;
}

const {
  steam: STEAM,
  puff: PUFF,
  heart: HEART,
  heartDark: HEART_DARK,
  mark: MARK,
  fur: FUR,
  sisal: SISAL_BIT,
  dust: DUST,
  spark: SPARK,
  sparkCore: SPARK_CORE,
  star: STAR,
  page: PAGE,
  line: LINE,
  water: WATER,
  crumb: CRUMB,
} = ACTIVITY_FX_COLORS;

function grid(rows: string[], colors: Record<string, string>): SpriteData {
  return rows.map((r) => [...r].map((c) => colors[c] ?? ''));
}

const HEART_S = grid(['.h.h.', 'hHhHh', 'hHHHh', '.hHh.', '..h..'], { h: HEART_DARK, H: HEART });
const SPARK_S = grid(['.s.', 'sSs', '.s.'], { s: SPARK, S: SPARK_CORE });
const STAR_S = grid(['.s.', 'sss', '.s.'], { s: STAR });
const FUR_DOT = [[FUR]];
const SISAL_DOT = [[SISAL_BIT]];
const CRUMB_DOT = [[CRUMB]];
const WISP_A = grid(['.s', 's.', '.s'], { s: STEAM });
const WISP_B = grid(['s.', '.s', 's.'], { s: STEAM });
const PUFF_S = grid(['.pp', 'p..', '.pp'], { p: PUFF });
const MARKS_S = grid(['m..', 'm.m', '.mm', '..m'], { m: MARK });
const DUST_S = grid(['.d.', 'ddd'], { d: DUST });
const PAGE_S = grid(['pp', 'pp', 'pp'], { p: PAGE });
const RUSTLE_S = grid(['l.l', '...', 'l.l'], { l: LINE });
const RIPPLE_S = [
  grid(['.ww.', 'w..w', '.ww.'], { w: WATER }),
  grid(['.www.', 'w...w', '.www.'], { w: WATER }),
];

/** 0..1 phase of a repeating cycle. */
const cyc = (t: number, sec: number, off = 0) => (((t / sec + off) % 1) + 1) % 1;

/** The effect's sprites at time t (seconds into the step or a free clock). */
export function fxDrawables(kind: FxKind, at: FxAnchor, t: number): FxDrawable[] {
  const out: FxDrawable[] = [];
  const side = at.mirror ? -1 : 1;
  const add = (sprite: SpriteData, dx: number, dy: number, alpha = 1) => {
    const w = sprite[0]?.length ?? 1;
    const x = Math.round(at.x + side * dx - (at.mirror ? w - 1 : 0));
    out.push({ sprite, x, y: Math.round(at.y + dy), zY: at.zY, alpha });
  };
  switch (kind) {
    case 'steam':
      for (let i = 0; i < 2; i++) {
        const p = cyc(t, 1.6, i * 0.5);
        add(
          i ? WISP_B : WISP_A,
          i * 2 - 1 + Math.round(Math.sin(p * 6) * 0.6),
          -3 - p * 7,
          fade(p),
        );
      }
      break;
    case 'blow': {
      const p = cyc(t, 0.6);
      add(PUFF_S, 2 + p * 4, -1, fade(p));
      break;
    }
    case 'hearts':
      for (let i = 0; i < 2; i++) {
        const p = cyc(t, 1.8, i * 0.5);
        add(HEART_S, -3 + i * 5 + Math.round(Math.sin(p * 5 + i) * 1), -5 - p * 9, fade(p));
      }
      break;
    case 'scratch':
      add(MARKS_S, 0, 0, 1);
      for (let i = 0; i < 2; i++) {
        const p = cyc(t, 0.7, i * 0.45);
        add(i ? FUR_DOT : SISAL_DOT, -1 - i * 2, 2 + p * 10, fade(p));
      }
      break;
    case 'fur':
      for (let i = 0; i < 3; i++) {
        const p = cyc(t, 1.2, i * 0.33);
        add(FUR_DOT, -3 + i * 3 + Math.round(Math.sin(p * 8 + i)), p * 8, fade(p));
      }
      break;
    case 'dust':
      for (let i = 0; i < 2; i++) {
        const p = cyc(t, 0.5, i * 0.5);
        add(DUST_S, (i ? 3 : -5) + (i ? p * 2 : -p * 2), -p * 2, 1 - p);
      }
      break;
    case 'sparkle':
      for (let i = 0; i < 2; i++) {
        const p = cyc(t, 0.9, i * 0.5);
        add(SPARK_S, i ? 4 : -5, -2 - i * 3 - p * 2, p < 0.5 ? 1 : (1 - p) * 2);
      }
      break;
    case 'dizzy':
      for (let i = 0; i < 3; i++) {
        const a = cyc(t, 1.1, i / 3) * Math.PI * 2;
        add(STAR_S, Math.round(Math.cos(a) * 5) - 1, Math.round(Math.sin(a) * 1.5) - 1, 1);
      }
      break;
    case 'page': {
      const p = cyc(t, 0.5);
      add(PAGE_S, Math.round(-2 + p * 4), -Math.round(Math.sin(p * Math.PI) * 3), 1);
      break;
    }
    case 'rustle':
      add(RUSTLE_S, Math.round(Math.sin(t * 20)), 0, cyc(t, 0.3) < 0.6 ? 1 : 0.4);
      break;
    case 'ripple': {
      const p = cyc(t, 0.9);
      add(RIPPLE_S[p < 0.5 ? 0 : 1], p < 0.5 ? -2 : -3, -1, 1 - p * 0.7);
      break;
    }
    case 'crumbs':
      for (let i = 0; i < 2; i++) {
        const p = cyc(t, 0.6, i * 0.5);
        add(CRUMB_DOT, i * 3 - 1, -p * 3 + p * p * 5, 1 - p);
      }
      break;
  }
  return out;
}

/** Fade in fast, out slow over a 0..1 cycle. */
function fade(p: number): number {
  return p < 0.15 ? p / 0.15 : Math.max(0, 1 - (p - 0.15) / 0.85);
}

/** The anchor of an effect at frame px (fx, fy) of a 16x32 pose drawn at (left, top). */
export function frameAnchor(
  left: number,
  top: number,
  fx: number,
  fy: number,
  dir: DirectionT,
  zY: number,
): FxAnchor {
  const mirror = dir === Direction.LEFT;
  return { x: left + (mirror ? 15 - fx : fx), y: top + fy, mirror, zY };
}

/** Z key just in front of a character standing at `ch`. */
export function frontOf(ch: Pick<Character, 'y'>): number {
  return ch.y + TILE_SIZE / 2 + 0.6;
}

/** Default effect point: just above the head of a standing cat (frame px). */
const ABOVE_HEAD: readonly [number, number] = [8, 4];

/** The effects of a cat's current activity step, in world px. */
export function characterFx(ch: Character): FxDrawable[] {
  // Inside the play tunnel: the fabric rustles where the cat runs.
  if (isHiddenInRunThrough(ch)) {
    const at = { x: Math.round(ch.x) - 1, y: Math.round(ch.y) - 5, mirror: false, zY: frontOf(ch) };
    return fxDrawables('rustle', at, ch.x / 8);
  }
  const step = activityStep(ch);
  if (!step?.fx || !ch.activity) return [];
  const dir = step.dir ?? ch.dir;
  const at = step.fxAt ?? ABOVE_HEAD;
  const [fx, fy] =
    'down' in at ? (dir === Direction.DOWN ? at.down : dir === Direction.UP ? at.up : at.side) : at;
  const left = Math.round(ch.x + characterDrawOffsetX(ch) - 8);
  const top = Math.round(ch.y + characterDrawOffsetY(ch) - 32);
  return fxDrawables(
    step.fx,
    frameAnchor(left, top, fx, fy, dir, frontOf(ch)),
    (ch.activity.elapsed ?? 0) + ch.id * 0.37,
  );
}
