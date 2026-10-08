// Runtime cat sprites for profile previews. Reuses the build-time generator in
// scripts/cats/ (pure JS label grids + breed palettes): an Appearance becomes
// a breed object, the generator draws the frames, colorize() paints them.

import {
  type Breed,
  BREEDS,
  type Cell,
  colorize,
  type Rgb,
} from '../../../scripts/cats/breeds.mjs';
import { renderCatFrames } from '../../../scripts/cats/poses.mjs';
import { renderSocialCatFrames } from '../../../scripts/cats/social.mjs';
import type { SpriteData } from '../office/types.js';
import type { Appearance, ColorLayers, Hex, PatternId } from './catsApi.js';

export interface Preset {
  id: string;
  name: string;
  /** Short description (breed or coat). */
  label: string;
  appearance: Appearance;
}

const presetId = (b: { name: string; id?: string }) => b.id ?? b.name.toLowerCase();

/** The 13 office breeds, in char_N order. */
export const BREED_PRESETS: Preset[] = BREEDS.map((b) => ({
  id: presetId(b),
  name: b.name,
  label: b.breed,
  appearance: { breed: presetId(b) },
}));
export const BREED_IDS = BREED_PRESETS.map((p) => p.id);

/** Which breed carries each coat pattern function (and its extra palette keys). */
const PATTERN_SOURCE: Record<Exclude<PatternId, 'solid'>, string> = {
  tabby: 'smokey',
  tuxedo: 'tux',
  calico: 'patches',
  tortie: 'tortie',
  siamese: 'mochi',
  bengal: 'leo',
  sweater: 'dobby',
};

const breedById = (id: string | undefined) => BREEDS.find((b) => presetId(b) === id) ?? BREEDS[0];

/** The pattern a breed draws by default. */
export function breedPattern(id: string | undefined): PatternId {
  const fn = breedById(id).pattern;
  const found = Object.entries(PATTERN_SOURCE).find(([, src]) => breedById(src).pattern === fn);
  return fn && found ? (found[0] as PatternId) : 'solid';
}

// ── Colour helpers ────────────────────────────────────────────────────────

export function toHex([r, g, b]: Rgb): Hex {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: Hex): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const scale = (c: Rgb, k: number): Rgb => [clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k)];
const toward = (c: Rgb, t: Rgb, k: number): Rgb => [
  clamp(c[0] + (t[0] - c[0]) * k),
  clamp(c[1] + (t[1] - c[1]) * k),
  clamp(c[2] + (t[2] - c[2]) * k),
];
const luma = ([r, g, b]: Rgb) => 0.299 * r + 0.587 * g + 0.114 * b;
const WHITE: Rgb = [255, 255, 255];
const DARK_OUTLINE: Rgb = [16, 12, 20];

/** The colour a layer shows when the profile does not override it. */
export function layerColor(
  appearance: Appearance,
  layer: keyof ColorLayers | 'eyes' | 'collar',
): Hex {
  const b = resolveBreed(appearance);
  const key = layer === 'eyes' ? 'eye' : layer;
  const value = (b[key] as Rgb | undefined) ?? (b.fur as Rgb);
  return toHex(value);
}

/** Appearance → breed object the generator understands. */
export function resolveBreed(a: Appearance): Breed {
  const base = breedById(a.breed);
  const b: Breed = { ...base };
  if (a.pattern && a.pattern !== breedPattern(a.breed)) {
    // Paws belong to the old pattern (tuxedo white, siamese dark); the new one re-sets them.
    delete b.paw;
    if (a.pattern === 'solid') {
      delete b.pattern;
    } else {
      const src = breedById(PATTERN_SOURCE[a.pattern]);
      b.pattern = src.pattern;
      // The pattern paints palette keys (stripe, patchA, point...) the base may lack.
      for (const [k, v] of Object.entries(src)) if (b[k] === undefined) b[k] = v;
      if (a.pattern === 'tuxedo') b.paw = b.belly;
    }
  }
  const c = a.colors ?? {};
  if (c.fur) {
    const fur = fromHex(c.fur);
    b.fur = fur;
    b.shade = scale(fur, 0.8);
    b.light = toward(fur, WHITE, 0.3);
    if (luma(fur) < 70) b.outline = DARK_OUTLINE;
  }
  if (c.belly) {
    b.belly = fromHex(c.belly);
    if (base.paw !== undefined || a.pattern === 'tuxedo') b.paw = b.belly;
  }
  if (c.stripe) {
    b.stripe = fromHex(c.stripe);
    b.spotIn = toward(b.stripe as Rgb, b.fur as Rgb, 0.5);
  }
  if (c.patchA) {
    b.patchA = fromHex(c.patchA);
    b.patchAShade = scale(b.patchA as Rgb, 0.82);
  }
  if (c.patchB) {
    b.patchB = fromHex(c.patchB);
    b.patchBShade = scale(b.patchB as Rgb, 0.78);
  }
  if (c.point) {
    b.point = fromHex(c.point);
    b.pointShade = scale(b.point as Rgb, 0.75);
    b.paw = b.point;
  }
  if (a.eyes) {
    b.eye = fromHex(a.eyes);
    delete b.eye2;
  }
  if (a.collar === 'none') b.collar = null;
  else if (a.collar) b.collar = fromHex(a.collar);
  return b;
}

// ── Coat presets (extra colours on top of the breeds) ─────────────────────

type CoatSpec = [
  name: string,
  breed: string,
  pattern: PatternId,
  colors: Partial<Record<keyof ColorLayers, Rgb>>,
  eyes: Rgb,
];

const COATS: CoatSpec[] = [
  ['Cinnamon', 'nikolai', 'solid', { fur: [170, 98, 62], belly: [196, 128, 88] }, [226, 170, 60]],
  ['Chocolate', 'nikolai', 'solid', { fur: [104, 66, 48], belly: [128, 86, 64] }, [214, 160, 54]],
  ['Lilac', 'nikolai', 'solid', { fur: [196, 180, 190], belly: [222, 210, 216] }, [222, 164, 70]],
  ['Fawn', 'nikolai', 'solid', { fur: [222, 194, 164], belly: [240, 222, 200] }, [200, 150, 60]],
  ['Red', 'nikolai', 'solid', { fur: [214, 102, 52], belly: [236, 150, 100] }, [210, 160, 50]],
  ['Smoke', 'shadow', 'solid', { fur: [86, 86, 98], belly: [140, 140, 150] }, [236, 190, 60]],
  [
    'Silver tabby',
    'smokey',
    'tabby',
    { fur: [206, 210, 216], belly: [240, 240, 244], stripe: [52, 54, 64] },
    [110, 190, 90],
  ],
  [
    'Brown tabby',
    'smokey',
    'tabby',
    { fur: [150, 112, 74], belly: [222, 200, 168], stripe: [56, 40, 28] },
    [196, 164, 60],
  ],
  [
    'Blue tabby',
    'smokey',
    'tabby',
    { fur: [140, 150, 168], belly: [214, 218, 228], stripe: [88, 98, 120] },
    [210, 170, 70],
  ],
  [
    'Golden',
    'smokey',
    'tabby',
    { fur: [232, 186, 96], belly: [250, 232, 190], stripe: [190, 132, 54] },
    [110, 180, 80],
  ],
  [
    'Seal point',
    'mochi',
    'siamese',
    { fur: [236, 222, 196], belly: [246, 236, 216], point: [70, 46, 36] },
    [70, 140, 240],
  ],
  [
    'Blue point',
    'mochi',
    'siamese',
    { fur: [236, 236, 240], belly: [248, 248, 250], point: [112, 122, 146] },
    [90, 160, 244],
  ],
  [
    'Lilac point',
    'mochi',
    'siamese',
    { fur: [244, 238, 236], belly: [250, 246, 244], point: [170, 150, 162] },
    [110, 170, 244],
  ],
  [
    'Dilute calico',
    'patches',
    'calico',
    { fur: [246, 242, 236], patchA: [232, 196, 150], patchB: [140, 146, 164] },
    [210, 170, 70],
  ],
  [
    'Blue tortie',
    'tortie',
    'tortie',
    {
      fur: [110, 116, 134],
      belly: [124, 130, 148],
      patchA: [226, 190, 150],
      patchB: [176, 150, 130],
    },
    [220, 176, 80],
  ],
  ['Black & white', 'tux', 'tuxedo', { fur: [36, 34, 42], belly: [248, 248, 248] }, [236, 200, 70]],
  [
    'Grey & white',
    'tux',
    'tuxedo',
    { fur: [126, 128, 140], belly: [248, 248, 248] },
    [120, 200, 100],
  ],
  [
    'Snow leopard',
    'leo',
    'bengal',
    { fur: [224, 222, 214], belly: [244, 242, 236], stripe: [70, 70, 78] },
    [120, 200, 220],
  ],
];

/** Extra coat colours, offered next to the breeds (pets use them most). */
export const COAT_PRESETS: Preset[] = COATS.map(([name, breed, pattern, colors, eyes]) => ({
  id: 'coat-' + presetId({ name }).replace(/[^a-z]+/g, '-'),
  name,
  label: pattern === 'solid' ? 'solid' : pattern,
  appearance: {
    breed,
    pattern,
    eyes: toHex(eyes),
    colors: Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, toHex(v)])),
  },
}));

// ── Frames ────────────────────────────────────────────────────────────────

/** Directions in generator row order. */
export const ART_DIRS = ['down', 'up', 'right'] as const;
export type ArtDir = (typeof ART_DIRS)[number];

/** frames[dir][i]: 0-2 walk, 3-4 type, 5-6 read, then idle and toy poses. */
export type CatFrames = Record<ArtDir, SpriteData[]>;

const cache = new Map<string, CatFrames>();
const CACHE_LIMIT = 64;

/** A generator grid painted in the breed colours. */
function paint(breed: Breed, grid: Array<Array<Cell | null>>, dir: ArtDir): SpriteData {
  return grid.map((line) =>
    line.map((cell) => {
      const [r, g, bl, alpha] = colorize(breed, cell, dir);
      return alpha === 0 ? '' : toHex([r, g, bl]);
    }),
  );
}

export function renderAppearance(a: Appearance): CatFrames {
  const key = JSON.stringify(a);
  const hit = cache.get(key);
  if (hit) return hit;
  const breed = resolveBreed(a);
  const rows = renderCatFrames(breed);
  const frames = {} as CatFrames;
  ART_DIRS.forEach((dir, d) => {
    frames[dir] = rows[d].map((grid) => paint(breed, grid, dir));
  });
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(key, frames);
  return frames;
}

/** Social-scene poses of a coat: talk frames per direction. */
export interface SocialArt {
  talk: CatFrames;
}

/**
 * The idle social pose (talk) of a coat, from the same generator as
 * the breed sheet in cat-social.json (scripts/cats/social.mjs). Not cached:
 * office/sprites/appearanceSprites.ts caches per appearance.
 */
export function renderSocialAppearance(a: Appearance): SocialArt {
  const breed = resolveBreed(a);
  const rows = renderSocialCatFrames(breed);
  const art: SocialArt = { talk: {} as CatFrames };
  for (const dir of ART_DIRS) art.talk[dir] = rows[dir].talk.map((grid) => paint(breed, grid, dir));
  return art;
}
