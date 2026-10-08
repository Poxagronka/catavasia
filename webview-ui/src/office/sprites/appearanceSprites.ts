/**
 * Office sprites of a custom cat coat: the same runtime generation the Cats
 * menu previews use (cats/catArt.ts renderAppearance), turned into the sprite
 * sets the renderer draws, with the idle social pose (talk) of the
 * same coat. A plain breed preset needs none: its char_N sheet
 * (the character palette) already is that breed.
 */

import { type CatFrames, renderAppearance, renderSocialAppearance } from '../../cats/catArt.js';
import type { Appearance } from '../../cats/catsApi.js';
import type { SpriteData } from '../types.js';
import { Direction } from '../types.js';
import { type CharacterSprites, flipSpriteHorizontal, spritesFromSheet } from './spriteData.js';

/** Generator frames by office direction (left = mirrored right). */
function byDirection(frames: CatFrames): Record<Direction, SpriteData[]> {
  return {
    [Direction.DOWN]: frames.down,
    [Direction.UP]: frames.up,
    [Direction.RIGHT]: frames.right,
    [Direction.LEFT]: frames.right.map(flipSpriteHorizontal),
  };
}

const cache = new Map<string, CharacterSprites>();

/** Sprites of a custom coat, or undefined when the appearance is a plain breed. */
export function appearanceSprites(appearance: Appearance): CharacterSprites | undefined {
  const custom = Object.entries(appearance).some(([k, v]) => k !== 'breed' && v !== undefined);
  if (!custom) return undefined;
  const key = JSON.stringify(appearance);
  let sprites = cache.get(key);
  if (!sprites) {
    const social = renderSocialAppearance(appearance);
    sprites = {
      ...spritesFromSheet(renderAppearance(appearance)),
      social: { talk: byDirection(social.talk) },
    };
    cache.set(key, sprites);
  }
  return sprites;
}
