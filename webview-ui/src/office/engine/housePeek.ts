/**
 * A cat asleep INSIDE a cat house shows only its ears (in a window or hole)
 * or its tail (out of the door). The overlay is a tiny template recolored
 * with the cat's own fur, drawn just in front of the house. The peek point
 * comes from the spot (bedActivities.ts HOUSE_PEEKS, world px).
 */
import {
  HOUSE_PEEK_INNER_EAR_COLOR,
  HOUSE_PEEK_OUTLINE_COLOR,
  HOUSE_PEEK_RIM_COLOR,
} from '../../constants.js';
import { getCachedSprite } from '../sprites/spriteCache.js';
import type { HousePeek, SpriteData } from '../types.js';

// o = outline, F = fur, p = inner ear. Bottom-centre is the anchor.
const EARS = ['.o...o.', 'opo.opo', 'oFFoFFo'];
const TAIL = ['....o.', '...oFo', 'ooooFo', 'oFFFo.'];

const cache = new Map<string, SpriteData>();

/** The ears / tail sprite in this fur color. */
export function peekSprite(kind: HousePeek['kind'], fur: string): SpriteData {
  const key = `${kind}:${fur}`;
  let s = cache.get(key);
  if (!s) {
    const rows = kind === 'ears' ? EARS : TAIL;
    const color: Record<string, string> = {
      // A near-black cat gets a light rim: a dark outline would vanish in the doorway.
      o: isDark(fur) ? HOUSE_PEEK_RIM_COLOR : HOUSE_PEEK_OUTLINE_COLOR,
      F: fur || HOUSE_PEEK_OUTLINE_COLOR,
      p: HOUSE_PEEK_INNER_EAR_COLOR,
    };
    s = rows.map((r) => [...r].map((c) => color[c] ?? ''));
    cache.set(key, s);
  }
  return s;
}

/** Perceived brightness under ~25 %. */
function isDark(hex: string): boolean {
  const n = parseInt(hex.slice(1, 7), 16);
  if (!hex || Number.isNaN(n)) return false;
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum < 64;
}

/** A z-sorted drawable of the peek, in front of its house. */
export function peekDrawable(
  peek: HousePeek,
  fur: string,
  offsetX: number,
  offsetY: number,
  zoom: number,
): { zY: number; draw: (c: CanvasRenderingContext2D) => void } {
  const sprite = peekSprite(peek.kind, fur);
  const img = getCachedSprite(sprite, zoom);
  const left = peek.x - Math.floor(sprite[0].length / 2);
  const top = peek.y - sprite.length;
  const x = Math.round(offsetX + left * zoom);
  const y = Math.round(offsetY + top * zoom);
  return { zY: peek.zY, draw: (c) => c.drawImage(img, x, y) };
}

const furCache = new WeakMap<SpriteData, string>();

/** Most common non-outline color of a sprite: the fur of a pet sheet frame. */
export function dominantFur(sprite: SpriteData): string {
  const hit = furCache.get(sprite);
  if (hit !== undefined) return hit;
  const counts = new Map<string, number>();
  let outline: string | null = null;
  for (const row of sprite)
    for (const px of row) {
      if (!px) continue;
      outline ??= px; // the first pixel met is on the silhouette edge
      if (px !== outline) counts.set(px, (counts.get(px) ?? 0) + 1);
    }
  let best = '';
  let max = 0;
  for (const [c, n] of counts) if (n > max) [best, max] = [c, n];
  furCache.set(sprite, best);
  return best;
}
