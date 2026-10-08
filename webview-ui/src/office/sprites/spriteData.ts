import type { ColorValue } from '../../components/ui/types.js';
import { PALETTE_COUNT } from '../../constants.js';
import { adjustSprite } from '../colorize.js';
import type { Direction, SpriteData } from '../types.js';
import { Direction as Dir } from '../types.js';
import bubblePermissionData from './bubble-permission.json';
import bubblePetData from './bubble-pet.json';
import bubbleWaitingData from './bubble-waiting.json';

// ── Speech Bubble Sprites ───────────────────────────────────────

interface BubbleSpriteJson {
  palette: Record<string, string>;
  pixels: string[][];
}

function resolveBubbleSprite(data: BubbleSpriteJson): SpriteData {
  return data.pixels.map((row) => row.map((key) => data.palette[key] ?? key));
}

/** Permission bubble: white square with "..." in amber, and a tail pointer (11x13) */
export const BUBBLE_PERMISSION_SPRITE: SpriteData = resolveBubbleSprite(bubblePermissionData);

/** Waiting bubble: white square with green checkmark, and a tail pointer (11x13) */
export const BUBBLE_WAITING_SPRITE: SpriteData = resolveBubbleSprite(bubbleWaitingData);

/** Heart bubble: pet petting feedback (11x13) */
export const BUBBLE_HEART_SPRITE: SpriteData = resolveBubbleSprite(bubblePetData);

// ════════════════════════════════════════════════════════════════
// Loaded character sprites (from PNG assets)
// ════════════════════════════════════════════════════════════════

interface LoadedCharacterData {
  down: SpriteData[];
  up: SpriteData[];
  right: SpriteData[];
}

let loadedCharacters: LoadedCharacterData[] | null = null;

/** Set pre-colored character sprites loaded from PNG assets. Call this when characterSpritesLoaded message arrives. */
export function setCharacterTemplates(data: LoadedCharacterData[]): void {
  loadedCharacters = data;
  // Clear cache so sprites are rebuilt from loaded data
  spriteCache.clear();
}

/** Return the number of loaded character palettes, or PALETTE_COUNT as fallback. */
export function getLoadedCharacterCount(): number {
  return loadedCharacters ? loadedCharacters.length : PALETTE_COUNT;
}

/** Flip a SpriteData horizontally (for generating left sprites from right) */
export function flipSpriteHorizontal(sprite: SpriteData): SpriteData {
  return sprite.map((row) => [...row].reverse());
}

/** Sheet frames before the idle-activity frames (walk x3, type x2, read x2). */
const IDLE_FRAME_OFFSET = 7;

// ════════════════════════════════════════════════════════════════
// Sprite resolution + caching
// ════════════════════════════════════════════════════════════════

export interface CharacterSprites {
  walk: Record<Direction, [SpriteData, SpriteData, SpriteData, SpriteData]>;
  typing: Record<Direction, [SpriteData, SpriteData]>;
  reading: Record<Direction, [SpriteData, SpriteData]>;
  /** Idle-activity frames (sheet frames 7..), empty for a 7-frame sheet. */
  idle: Record<Direction, SpriteData[]>;
  /** Social poses of a custom coat; absent: the breed art in cat-social.json. */
  social?: Record<'talk', Record<Direction, SpriteData[]>>;
}

const spriteCache = new Map<string, CharacterSprites>();

/** Apply hue shift to every sprite in a CharacterSprites set */
function hueShiftSprites(sprites: CharacterSprites, hueShift: number): CharacterSprites {
  const color: ColorValue = { h: hueShift, s: 0, b: 0, c: 0 };
  const shiftSet = <T extends SpriteData[]>(set: Record<Direction, T>): Record<Direction, T> => {
    const out = {} as Record<Direction, T>;
    for (const dir of [Dir.DOWN, Dir.UP, Dir.RIGHT, Dir.LEFT]) {
      out[dir] = set[dir].map((s) => adjustSprite(s, color)) as T;
    }
    return out;
  };
  return {
    walk: shiftSet(sprites.walk),
    typing: shiftSet(sprites.typing),
    reading: shiftSet(sprites.reading),
    idle: shiftSet(sprites.idle),
  };
}

/** Create a transparent placeholder sprite of given dimensions */
function emptySprite(w: number, h: number): SpriteData {
  const rows: string[][] = [];
  for (let y = 0; y < h; y++) {
    rows.push(new Array(w).fill(''));
  }
  return rows;
}

/** One sheet (down / up / right frames) as the sprite sets the renderer draws. */
export function spritesFromSheet(char: LoadedCharacterData): CharacterSprites {
  const d = char.down;
  const u = char.up;
  const rt = char.right;
  const flip = flipSpriteHorizontal;
  return {
    walk: {
      [Dir.DOWN]: [d[0], d[1], d[2], d[1]],
      [Dir.UP]: [u[0], u[1], u[2], u[1]],
      [Dir.RIGHT]: [rt[0], rt[1], rt[2], rt[1]],
      [Dir.LEFT]: [flip(rt[0]), flip(rt[1]), flip(rt[2]), flip(rt[1])],
    },
    typing: {
      [Dir.DOWN]: [d[3], d[4]],
      [Dir.UP]: [u[3], u[4]],
      [Dir.RIGHT]: [rt[3], rt[4]],
      [Dir.LEFT]: [flip(rt[3]), flip(rt[4])],
    },
    reading: {
      [Dir.DOWN]: [d[5], d[6]],
      [Dir.UP]: [u[5], u[6]],
      [Dir.RIGHT]: [rt[5], rt[6]],
      [Dir.LEFT]: [flip(rt[5]), flip(rt[6])],
    },
    idle: {
      [Dir.DOWN]: d.slice(IDLE_FRAME_OFFSET),
      [Dir.UP]: u.slice(IDLE_FRAME_OFFSET),
      [Dir.RIGHT]: rt.slice(IDLE_FRAME_OFFSET),
      [Dir.LEFT]: rt.slice(IDLE_FRAME_OFFSET).map(flip),
    },
  };
}

export function getCharacterSprites(paletteIndex: number, hueShift = 0): CharacterSprites {
  const cacheKey = `${paletteIndex}:${hueShift}`;
  const cached = spriteCache.get(cacheKey);
  if (cached) return cached;

  let sprites: CharacterSprites;

  if (loadedCharacters) {
    // Use pre-colored character sprites directly (no palette swapping)
    sprites = spritesFromSheet(loadedCharacters[paletteIndex % loadedCharacters.length]);
  } else {
    // Fallback: return transparent placeholder sprites (16×32)
    const e = emptySprite(16, 32);
    const walkSet: [SpriteData, SpriteData, SpriteData, SpriteData] = [e, e, e, e];
    const pairSet: [SpriteData, SpriteData] = [e, e];
    sprites = {
      walk: {
        [Dir.DOWN]: walkSet,
        [Dir.UP]: walkSet,
        [Dir.RIGHT]: walkSet,
        [Dir.LEFT]: walkSet,
      },
      typing: {
        [Dir.DOWN]: pairSet,
        [Dir.UP]: pairSet,
        [Dir.RIGHT]: pairSet,
        [Dir.LEFT]: pairSet,
      },
      reading: {
        [Dir.DOWN]: pairSet,
        [Dir.UP]: pairSet,
        [Dir.RIGHT]: pairSet,
        [Dir.LEFT]: pairSet,
      },
      idle: { [Dir.DOWN]: [], [Dir.UP]: [], [Dir.RIGHT]: [], [Dir.LEFT]: [] },
    };
  }

  // Apply hue shift if non-zero
  if (hueShift !== 0) {
    sprites = hueShiftSprites(sprites, hueShift);
  }

  spriteCache.set(cacheKey, sprites);
  return sprites;
}
