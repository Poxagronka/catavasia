/**
 * Frames of a furniture item in use, picked by an activity step (`item`):
 * the frames of its animation group in the catalog (a coffee machine
 * brewing), or a runtime patch of its sprite (a bookshelf with one book out).
 */

import { getAnimationFrames, getCatalogEntry } from '../layout/furnitureCatalog.js';
import type { SpriteData } from '../types.js';
import { shelfGapSprite } from './shelfGap.js';

/** Sprite of `type` at animation frame `frame` (0 = its idle look), or undefined. */
export function itemFrameSprite(type: string, frame: number): SpriteData | undefined {
  const base = type.split(':')[0];
  const frames = getAnimationFrames(base);
  if (frames && frames.length > 1) {
    return getCatalogEntry(frames[Math.min(frame, frames.length - 1)])?.sprite;
  }
  const entry = getCatalogEntry(base);
  return entry ? shelfGapSprite(base, entry.sprite) : undefined;
}
