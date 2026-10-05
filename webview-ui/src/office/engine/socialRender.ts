/**
 * Drawing for cat social scenes. The renderer calls three hooks: the sprite
 * override per cat, the fight dust cloud as a z-sorted drawable, and the
 * pictogram bubbles / anger marks in the bubble pass. All state comes from
 * `Character.social`, written by CatSocial.
 */
import {
  SOCIAL_ANGER_HEAD_OFFSET_X_PX,
  SOCIAL_ANGER_HEAD_OFFSET_Y_PX,
  SOCIAL_BUBBLE_OFFSET_PX,
} from '../../constants.js';
import {
  getAngerSprite,
  getCloudSprite,
  getFurColor,
  getSocialBubbleSprite,
  getSocialPoseSprite,
} from '../sprites/socialSprites.js';
import { getCachedSprite } from '../sprites/spriteCache.js';
import type { Character, SpriteData } from '../types.js';
import { Direction, TILE_SIZE } from '../types.js';
import { socialBubbleVisible } from './catSocial.js';

/** The sprite to draw for a cat: its social pose, the base sprite, or null when hidden in the cloud. */
export function socialSpriteFor(ch: Character, base: SpriteData): SpriteData | null {
  const v = ch.social;
  if (!v || v.pose === null) return base;
  if (v.pose === 'hidden') return null;
  return getSocialPoseSprite(ch.palette, ch.hueShift, v.pose, ch.dir, v.frame) ?? base;
}

/** The fight dust cloud carried by `ch`, as a z-sorted drawable, or null. */
export function socialCloudDrawable(
  ch: Character,
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
): { zY: number; draw: (c: CanvasRenderingContext2D) => void } | null {
  const cloud = ch.social?.cloud;
  if (!cloud) return null;
  const other = characters.find((c) => c.id === cloud.otherId);
  const furA = getFurColor(ch.palette, ch.hueShift);
  const furB = other ? getFurColor(other.palette, other.hueShift) : furA;
  const img = getCachedSprite(getCloudSprite(cloud.frame, furA, furB), zoom);
  const x = Math.round(offsetX + cloud.x * zoom - img.width / 2);
  const y = Math.round(offsetY + cloud.y * zoom - img.height);
  return { zY: cloud.y + TILE_SIZE / 2, draw: (c) => c.drawImage(img, x, y) };
}

/** Pictogram bubbles and anger marks. Permission / waiting bubbles win the slot. */
export function renderSocialBubbles(
  ctx: CanvasRenderingContext2D,
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  for (const ch of characters) {
    const v = ch.social;
    if (!v || v.pose === 'hidden' || !socialBubbleVisible(ch)) continue;
    if (v.bubble) {
      const img = getCachedSprite(getSocialBubbleSprite(v.bubble), zoom);
      const x = Math.round(offsetX + ch.x * zoom - img.width / 2);
      const y = Math.round(offsetY + (ch.y - SOCIAL_BUBBLE_OFFSET_PX) * zoom - img.height);
      ctx.drawImage(img, x, y);
    }
    if (v.anger !== null) {
      // Above the back of the head, away from the face (and from the rival).
      const side = ch.dir === Direction.RIGHT ? -1 : 1;
      const img = getCachedSprite(getAngerSprite(v.anger), zoom);
      const ax = ch.x + side * SOCIAL_ANGER_HEAD_OFFSET_X_PX;
      const x = Math.round(offsetX + ax * zoom - img.width / 2);
      const y = Math.round(offsetY + (ch.y - SOCIAL_ANGER_HEAD_OFFSET_Y_PX) * zoom - img.height);
      ctx.drawImage(img, x, y);
    }
  }
}
