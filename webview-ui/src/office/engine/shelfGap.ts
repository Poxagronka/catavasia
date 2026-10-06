/**
 * A bookshelf with one book taken out: a cat reading a skill pulls the red
 * book at the right of the top shelf (scripts/cats/ "book" colour), and its
 * slot shows the dark back of the shelf until the book goes back. Pixel spots
 * come from the bookshelf art.
 */

import { SHELF_BACK_COLOR as SHELF_BACK } from '../../constants.js';
import type { SpriteData } from '../types.js';

/** The red book's pixels per shelf: [x0, x1, y0, y1], and rows above the shelf that vanish. */
const GAPS: Record<string, { x: [number, number]; y: [number, number]; top?: number }> = {
  BOOKSHELF: { x: [27, 28], y: [7, 12], top: 6 },
  DOUBLE_BOOKSHELF: { x: [27, 28], y: [7, 12], top: 6 },
};

/** Shelf types a cat can take a book from. */
export const SHELF_TYPES = Object.keys(GAPS);

const cache = new Map<string, SpriteData>();

/** The sprite with the book slot empty, or undefined for a type without a known book. */
export function shelfGapSprite(type: string, sprite: SpriteData): SpriteData | undefined {
  const gap = GAPS[type];
  if (!gap) return undefined;
  const hit = cache.get(type);
  if (hit && hit.length === sprite.length) return hit;
  const out = sprite.map((row) => row.slice());
  for (let x = gap.x[0]; x <= gap.x[1]; x++) {
    for (let y = gap.y[0]; y <= gap.y[1]; y++)
      if (out[y]?.[x] !== undefined) out[y][x] = SHELF_BACK;
    if (gap.top !== undefined && out[gap.top]?.[x] !== undefined) out[gap.top][x] = '';
  }
  cache.set(type, out);
  return out;
}
