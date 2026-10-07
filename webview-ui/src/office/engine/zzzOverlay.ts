import {
  PET_HEAD_ABOVE_ANCHOR_PX,
  ZZZ_CYCLE_SEC,
  ZZZ_EDGE_COLOR,
  ZZZ_FILL_COLOR,
  ZZZ_RISE_PX,
} from '../../constants.js';
import { getCachedSprite } from '../sprites/spriteCache.js';
import type { Character, Pet, SpriteData } from '../types.js';
import { CharacterState } from '../types.js';
import { activityHeadDropY, characterDrawOffsetX } from './characters.js';
import { getIdleActivity } from './idleActivities.js';
import { petNapAwake } from './petPlayAnims.js';

/** Pixel glyph from '#' fill rows, with a 1 px edge around the strokes. */
function glyph(rows: string[]): SpriteData {
  const h = rows.length + 2;
  const w = rows[0].length + 2;
  const fill = (x: number, y: number) => rows[y - 1]?.[x - 1] === '#';
  const out: SpriteData = [];
  for (let y = 0; y < h; y++) {
    const line: string[] = [];
    for (let x = 0; x < w; x++) {
      if (fill(x, y)) line.push(ZZZ_FILL_COLOR);
      else if (fill(x + 1, y) || fill(x - 1, y) || fill(x, y + 1) || fill(x, y - 1)) {
        line.push(ZZZ_EDGE_COLOR);
      } else line.push('');
    }
    out.push(line);
  }
  return out;
}

const SMALL_Z = glyph(['####', '..#.', '.#..', '####']);
const BIG_Z = glyph(['#####', '...#.', '..#..', '.#...', '#####']);

/** Head height of a standing cat sprite above its anchor, in sprite px. */
const HEAD_ABOVE_ANCHOR_PX = 20;

/**
 * Floating "Zzz" over characters whose activity asks for it (napping). Two
 * letters rise and fade on staggered cycles; the phase is per character so a
 * row of sleepers does not breathe in sync.
 */
export function renderZzz(
  ctx: CanvasRenderingContext2D,
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
  nowSec: number = performance.now() / 1000,
): void {
  for (const ch of characters) {
    if (ch.state !== CharacterState.ACTIVITY || !getIdleActivity(ch.activity?.id)?.zzz) continue;
    if (ch.activity?.part && ch.activity.part !== 'loop') continue; // awake: kneading, waking up
    const headY = ch.y - HEAD_ABOVE_ANCHOR_PX + activityHeadDropY(ch);
    drawZzz(
      ctx,
      ch.x + characterDrawOffsetX(ch),
      headY,
      ch.id * 0.37,
      offsetX,
      offsetY,
      zoom,
      nowSec,
    );
  }
}

/** "Zzz" over napping pets (a nap claim, see petCareSystem.ts). */
export function renderPetZzz(
  ctx: CanvasRenderingContext2D,
  pets: Pet[],
  offsetX: number,
  offsetY: number,
  zoom: number,
  nowSec: number = performance.now() / 1000,
): void {
  pets.forEach((pet, i) => {
    if (!pet.rest?.zzz) return;
    const anim = pet.careAnim;
    if (anim && petNapAwake(anim.kind, anim.t ?? 0, anim.dur ?? Infinity)) return;
    const headY = pet.y + pet.rest.offsetY - PET_HEAD_ABOVE_ANCHOR_PX;
    drawZzz(ctx, pet.x + pet.rest.offsetX, headY, i * 0.53 + 0.2, offsetX, offsetY, zoom, nowSec);
  });
}

/** Two letters rising and fading on staggered cycles above (x, headY). */
function drawZzz(
  ctx: CanvasRenderingContext2D,
  x0: number,
  headY: number,
  phase: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
  nowSec: number,
): void {
  for (let i = 0; i < 2; i++) {
    const t = (nowSec / ZZZ_CYCLE_SEC + i * 0.5 + phase) % 1;
    const sprite = getCachedSprite(i === 0 ? SMALL_Z : BIG_Z, zoom);
    const x = Math.round(offsetX + (x0 + 2 + t * 5) * zoom);
    const y = Math.round(offsetY + (headY - t * ZZZ_RISE_PX) * zoom - sprite.height);
    ctx.save();
    ctx.globalAlpha = t < 0.8 ? 1 : (1 - t) / 0.2;
    ctx.drawImage(sprite, x, y);
    ctx.restore();
  }
}
