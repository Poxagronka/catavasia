/**
 * Office sprites of a custom cat coat: the same runtime generation the Cats
 * menu previews use (cats/catArt.ts renderAppearance), turned into the sprite
 * sets the renderer draws. A plain breed preset needs none: its char_N sheet
 * (the character palette) already is that breed.
 */

import { renderAppearance } from '../../cats/catArt.js';
import type { Appearance } from '../../cats/catsApi.js';
import { type CharacterSprites, spritesFromSheet } from './spriteData.js';

const cache = new Map<string, CharacterSprites>();

/** Sprites of a custom coat, or undefined when the appearance is a plain breed. */
export function appearanceSprites(appearance: Appearance): CharacterSprites | undefined {
  const custom = Object.entries(appearance).some(([k, v]) => k !== 'breed' && v !== undefined);
  if (!custom) return undefined;
  const key = JSON.stringify(appearance);
  let sprites = cache.get(key);
  if (!sprites) {
    sprites = spritesFromSheet(renderAppearance(appearance));
    cache.set(key, sprites);
  }
  return sprites;
}
