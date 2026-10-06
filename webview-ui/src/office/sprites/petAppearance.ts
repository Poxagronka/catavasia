// Runtime coats for pet cats. A pet cat's sheet is its template sheet (the
// bundled Gitcat, or any cat pet from an external asset dir) repainted from an
// Appearance: same frames, same silhouette, new colour layers and pattern.
// The care poses (petCareFrames.ts) derive from whatever sheet they get, so a
// repainted sheet gets them too.

import type { Rgb } from '../../../../scripts/cats/breeds.mjs';
import { breedPattern, resolveBreed, toHex } from '../../cats/catArt.js';
import type { Appearance, PatternId } from '../../cats/catsApi.js';
import type { SpriteData } from '../types.js';
import type { PetSpriteFrames } from './petSpriteData.js';

type Role = 'outline' | 'fur' | 'shade' | 'earIn' | 'nose';
type View = 'front' | 'back' | 'side';
type Region = 'tail' | 'ear' | 'face' | 'collar' | 'belly' | 'paw' | 'torso' | 'body';

const luma = (h: string) => {
  const n = parseInt(h.slice(1, 7), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
};
const redness = (h: string) => {
  const n = parseInt(h.slice(1, 7), 16);
  return ((n >> 16) & 255) - ((n >> 8) & 255);
};

const allFrames = (t: PetSpriteFrames): Array<[View, SpriteData[]]> => [
  ['front', t.walkDown],
  ['front', t.idleDown],
  ['back', t.walkUp],
  ['back', t.idleUp],
  ['side', t.walkRight],
];

/**
 * Template colour → role, from the whole sheet: the outline is the most
 * common edge colour, the fur the most common other colour. Darker colours
 * are fur shade (Gitcat's markings), a reddish one is the nose, lighter
 * ones the inner ear.
 */
export function templateRoles(t: PetSpriteFrames): Map<string, Role> {
  const all = new Map<string, number>();
  const edge = new Map<string, number>();
  for (const [, frames] of allFrames(t))
    for (const s of frames)
      s.forEach((row, y) =>
        row.forEach((px, x) => {
          if (!px) return;
          all.set(px, (all.get(px) ?? 0) + 1);
          if (!s[y - 1]?.[x] || !s[y + 1]?.[x] || !row[x - 1] || !row[x + 1])
            edge.set(px, (edge.get(px) ?? 0) + 1);
        }),
      );
  const top = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const outline = top(edge);
  all.delete(outline);
  const fur = top(all);
  const roles = new Map<string, Role>([
    [outline, 'outline'],
    [fur, 'fur'],
  ]);
  for (const c of all.keys()) {
    if (c === fur) continue;
    if (redness(c) > 50) roles.set(c, 'nose');
    else roles.set(c, luma(c) < luma(fur) ? 'shade' : 'earIn');
  }
  return roles;
}

interface Geometry {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** Nose pixel (front and side views). */
  nose: { x: number; y: number } | null;
}

function geometry(s: SpriteData, roles: Map<string, Role>): Geometry {
  const g: Geometry = { minX: Infinity, maxX: -1, minY: Infinity, maxY: -1, nose: null };
  s.forEach((row, y) =>
    row.forEach((px, x) => {
      if (!px) return;
      g.minX = Math.min(g.minX, x);
      g.maxX = Math.max(g.maxX, x);
      g.minY = Math.min(g.minY, y);
      g.maxY = Math.max(g.maxY, y);
      if (roles.get(px) === 'nose' && (!g.nose || x > g.nose.x)) g.nose = { x, y };
    }),
  );
  return g;
}

/** Body region of a fur pixel, from fixed offsets to the nose (or the ear tips seen from behind). */
function regionOf(view: View, g: Geometry, x: number, y: number): Region {
  if (y >= g.maxY - 1) return 'paw';
  if (view === 'back' || !g.nose) {
    const cx = (g.minX + g.maxX) / 2;
    if (y <= g.minY + 2) return Math.abs(x - cx) >= 2.5 ? 'ear' : 'body';
    if (y === g.minY + 8) return 'collar';
    return y > g.minY + 8 ? 'torso' : 'body';
  }
  const { x: nx, y: ny } = g.nose;
  const dx = Math.abs(x - nx);
  if (view === 'front') {
    if (y < ny - 6) return 'tail';
    if (y <= ny - 3 && dx >= 3) return 'ear';
    if (y >= ny - 2 && y <= ny + 1 && dx <= 2) return 'face';
    if (y === ny + 2) return 'collar';
    if (y > ny + 2) return dx <= 2 ? 'belly' : 'torso';
    return 'body';
  }
  // Side view, facing right.
  if (x < nx - 12 && y < ny - 1) return 'tail';
  if (x >= nx - 8 && y < ny - 2) return 'ear';
  if (x >= nx - 4 && y >= ny - 2) return 'face';
  if (x === nx - 6 && y >= ny - 2 && y <= ny + 2) return 'collar';
  if (x < nx - 7 && y >= g.maxY - 5 && y <= g.maxY - 3) return 'belly';
  if (x < nx - 7 && y >= ny - 2) return 'torso';
  return 'body';
}

/** Outline pixels between two fur pixels next to the nose: the eyes. */
function isEye(s: SpriteData, roles: Map<string, Role>, g: Geometry, x: number, y: number) {
  if (!g.nose || y < g.nose.y - 2 || y >= g.nose.y || Math.abs(x - g.nose.x) > 4) return false;
  const furry = (px: string | undefined) => {
    const r = px ? roles.get(px) : undefined;
    return r === 'fur' || r === 'shade';
  };
  return furry(s[y][x - 1]) && furry(s[y][x + 1]);
}

/** Deterministic blob 0..2 for calico / tortie patches (cell size in px). */
function blob(x: number, y: number, cell: number, seed: number): number {
  const cx = Math.floor(x / cell);
  const cy = Math.floor(y / cell);
  const h = Math.imul(cx * 73856093 + 1, 1) ^ Math.imul(cy * 19349663 + seed, 1);
  return ((h >>> 0) % 7) % 3;
}

const scale = ([r, g, b]: Rgb, k: number): Rgb => [r * k, g * k, b * k].map(Math.round) as Rgb;

/** The colours one pet coat paints with (Breed keys, resolved). */
interface Coat {
  pattern: PatternId;
  rgb: (key: string) => Rgb | undefined;
}

function furColor(c: Coat, role: 'fur' | 'shade', region: Region, x: number, y: number): Rgb {
  const k = (key: string) => c.rgb(key)!;
  const shaded = (key: string, shadeKey: string) =>
    role === 'fur' ? k(key) : (c.rgb(shadeKey) ?? scale(k(key), 0.8));
  const plain = shaded('fur', 'shade');
  switch (c.pattern) {
    case 'tabby':
      if (region === 'belly') break;
      return role === 'shade' ? k('stripe') : plain;
    case 'bengal':
      if (region === 'belly' || region === 'paw') break;
      if (role === 'shade') return k('stripe');
      if ((x + 2 * y) % 4 === 0 && y % 2 === 0) return k('stripe');
      if ((x + 2 * y) % 4 === 1 && y % 2 === 0) return c.rgb('spotIn') ?? plain;
      return plain;
    case 'tuxedo':
      if (region === 'belly' || region === 'paw' || region === 'face') return k('belly');
      return plain;
    case 'calico':
    case 'tortie': {
      if (c.pattern === 'calico' && (region === 'belly' || region === 'paw')) return k('belly');
      const b = blob(x, y, c.pattern === 'calico' ? 3 : 2, c.pattern === 'calico' ? 5 : 11);
      if (b === 1) return shaded('patchA', 'patchAShade');
      if (b === 2) return shaded('patchB', 'patchBShade');
      return plain;
    }
    case 'siamese':
      if (['ear', 'face', 'tail', 'paw'].includes(region)) return shaded('point', 'pointShade');
      return plain;
    case 'sweater':
      if (region === 'torso' || region === 'belly' || region === 'collar')
        return role === 'fur' && y % 3 !== 0 ? k('sweater') : (c.rgb('rib') ?? k('sweater'));
      return plain;
    case 'solid':
      break;
  }
  if (region === 'belly') return role === 'fur' ? k('belly') : scale(k('belly'), 0.85);
  if (region === 'paw' && c.rgb('paw')) return k('paw');
  return plain;
}

function paintFrame(s: SpriteData, view: View, roles: Map<string, Role>, c: Coat): SpriteData {
  const g = geometry(s, roles);
  const hex = (rgb: Rgb) => toHex(rgb).toUpperCase();
  const collar = c.rgb('collar');
  return s.map((row, y) =>
    row.map((px, x) => {
      if (!px) return px;
      const role = roles.get(px);
      if (role === 'outline') {
        if (view !== 'back' && isEye(s, roles, g, x, y)) {
          const odd = view === 'front' && g.nose && x > g.nose.x && c.rgb('eye2');
          return hex(odd || c.rgb('eye')!);
        }
        return hex(c.rgb('outline')!);
      }
      if (role === 'nose') return hex(c.rgb('nose')!);
      if (role === 'earIn') return hex(c.rgb('earIn')!);
      if (role !== 'fur' && role !== 'shade') return px;
      const region = regionOf(view, g, x, y);
      if (region === 'collar' && collar && c.pattern !== 'sweater') return hex(collar);
      return hex(furColor(c, role, region, x, y));
    }),
  );
}

/** The pattern an Appearance paints (its own, or its breed's). */
export function petPattern(a: Appearance): PatternId {
  return a.pattern ?? breedPattern(a.breed);
}

/** Repaint a cat pet's sheet from an Appearance. Pure; see getPetSpritesFor for the cache. */
export function renderPetAppearance(t: PetSpriteFrames, a: Appearance): PetSpriteFrames {
  const breed = resolveBreed(a);
  const coat: Coat = {
    pattern: petPattern(a),
    rgb: (key) => (breed[key] as Rgb | null | undefined) ?? undefined,
  };
  const roles = templateRoles(t);
  const paint = (frames: SpriteData[], view: View) =>
    frames.map((f) => paintFrame(f, view, roles, coat)) as [SpriteData, SpriteData, SpriteData];
  const walkDown = paint(t.walkDown, 'front');
  const idleDown = paint(t.idleDown, 'front');
  const walkUp = paint(t.walkUp, 'back');
  const idleUp = paint(t.idleUp, 'back');
  const walkRight = paint(t.walkRight, 'side');
  const flip = (s: SpriteData) => s.map((row) => [...row].reverse());
  return {
    walkDown,
    idleDown,
    walkUp,
    idleUp,
    walkRight,
    walkLeft: walkRight.map(flip) as PetSpriteFrames['walkLeft'],
    idleRight: idleDown,
    idleLeft: idleUp,
  };
}
