// Pet-care pixel art as ASCII templates. One char = one pixel, '.' = empty.
// PALETTE maps every char to a color. Templates are composed into sprites by
// scripts/generate-pet-care-sprites.mjs. MIT like the rest of the repo.

export const PALETTE = {
  O: '#3f3740', // outline (matches the bundled furniture)
  // placemat
  M: '#b0484f',
  N: '#7e3039',
  // food bowl (warm ceramic) and water bowl (cool ceramic)
  A: '#f0a050',
  a: '#b8692c',
  B: '#6aaee0',
  b: '#3c78ad',
  // empty bowl interior
  e: '#5d5663',
  E: '#48414f',
  // kibble
  K: '#8a4f22',
  k: '#c98a4a',
  // water
  W: '#4fa6e0',
  w: '#c8f0ff',
  // litter box plastic + sand
  T: '#7fd3c9',
  P: '#3fa7a0',
  p: '#2b7570',
  S: '#e8d9a8',
  s: '#cbb985',
  c: '#b59a63',
  // poop
  D: '#7a4a24',
  d: '#5a3518',
  h: '#a8703c',
  // bubble frame (matches bubble-pet.json)
  F: '#eeeeff',
  G: '#555566',
  // icons
  f: '#f08a3c',
  i: '#2a2430',
  H: '#e64566',
  L: '#ffc0cc',
  u: '#f2c8a0',
  U: '#c8946a',
  y: '#e8609a',
  Y: '#a83a6a',
  g: '#9ccc5a',
  q: '#f6e27a',
  Q: '#ffffff',
  n: '#8a6a4a',
  r: '#d8c6a0',
};

// ── Food & water bowl combo (16x16 furniture) ────────────────
// Interior cells: '1' = top interior row, '2' = bottom interior row.
// Left bowl uses x < 8, right bowl x >= 8; fills are applied per side.
export const BOWL_COMBO = [
  '................',
  '................',
  '.OOOOOO..OOOOOO.',
  'OA1111AOOB1111BO',
  'OA2222AOOB2222BO',
  'OA3333AOOB3333BO',
  'OAAAAAAOOBBBBBBO',
  'NOaaaaONNObbbbON',
  'MNOOOONMMNOOOONM',
  'MMMMMMMMMMMMMMMM',
  'NNNNNNNNNNNNNNNN',
  '................',
  '................',
  '................',
  '................',
  '................',
];

/** Interior fill per level 0..3 for each interior row (4 px wide), top to bottom. */
export const FOOD_FILL = [
  { 1: 'EEEE', 2: 'EEEE', 3: 'eeee' },
  { 1: 'EEEE', 2: 'EEEE', 3: 'eKke' },
  { 1: 'EEEE', 2: 'kKkK', 3: 'KkKk' },
  { 1: 'KkKk', 2: 'kKkK', 3: 'KkKk' },
];
export const WATER_FILL = [
  { 1: 'EEEE', 2: 'EEEE', 3: 'eeee' },
  { 1: 'EEEE', 2: 'EEEE', 3: 'eWWe' },
  { 1: 'EEEE', 2: 'WwWW', 3: 'WWWW' },
  { 1: 'WwWW', 2: 'WWWw', 3: 'WWWW' },
];

// ── Litter box (16x16 furniture), 3 fill states ───────────────
const LITTER_BASE = [
  '................',
  '................',
  '................',
  '.OOOOOOOOOOOOOO.',
  'OTTTTTTTTTTTTTTO',
  'OTSSSSsSSSSsSSTO',
  'OTSsSSSSSsSSSSTO',
  'OTSSSSSsSSSSSsTO',
  'OPPPPPPPPPPPPPPO',
  'OppppppppppppppO',
  'OppppppppppppppO',
  '.OOOOOOOOOOOOOO.',
  '................',
  '................',
  '................',
  '................',
];

/** Overlay a template onto a base at (ox, oy); '.' cells keep the base. */
export function overlay(base, top, ox, oy) {
  const out = base.map((row) => [...row]);
  top.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const ty = oy + y;
      const tx = ox + x;
      if (ty >= 0 && ty < out.length && tx >= 0 && tx < out[ty].length) out[ty][tx] = ch;
    }),
  );
  return out.map((row) => row.join(''));
}

const CLUMP = ['.dd.', 'dDhd'];
const MINI_POOP = ['.Dd.', 'DhDd', 'dDDd'];

export const LITTER = [
  LITTER_BASE,
  overlay(overlay(LITTER_BASE, CLUMP, 3, 6), MINI_POOP, 9, 4),
  overlay(
    overlay(overlay(overlay(LITTER_BASE, MINI_POOP, 2, 4), MINI_POOP, 7, 5), MINI_POOP, 11, 4),
    CLUMP,
    5,
    6,
  ),
];

// ── Floor poop pile (8x7) + stink lines ───────────────────────
export const POOP = [
  '...OO...',
  '..ODDO..',
  '.ODhDdO.',
  '.ODDDdO.',
  'ODhDDDdO',
  'ODDDDddO',
  '.OOOOOO.',
];
export const STINK = [
  ['.g...g.', 'g...g..', '.g...g.', '..g...g', '.g...g.'],
  ['g...g..', '.g...g.', '..g...g', '.g...g.', 'g...g..'],
];

// ── Request bubble (11x13, same frame as bubble-pet.json) ─────
const BUBBLE = [
  '.GGGGGGGGG.',
  'GFFFFFFFFFG',
  'GFFFFFFFFFG',
  'GFFFFFFFFFG',
  'GFFFFFFFFFG',
  'GFFFFFFFFFG',
  'GFFFFFFFFFG',
  'GFFFFFFFFFG',
  'GFFFFFFFFFG',
  '.GGGGGGGGG.',
  '....GGG....',
  '.....G.....',
  '...........',
];

// 7x7 icons, drawn inside the bubble at (2, 1).
export const ICONS = {
  food: ['.......', '..OOO.O', '.OfffOO', 'OfifffO', '.OfffOO', '..OOO.O', '.......'],
  water: ['...O...', '..OWO..', '..OWO..', '.OWWWO.', 'OWwWWWO', 'OWWWWWO', '.OOOOO.'],
  scratch: ['.O.O.O.', 'OuOuOuO', 'OuOuOuO', 'OuuuuuO', 'OuuuuOO', '.OuuuO.', '..OOO..'],
  play: ['..OOO..', '.OyYyO.', 'OyYyyYO', 'OYyyYyO', 'OyyYyyO', '.OYyyO.', '..OOO.Y'],
  litter: ['...O...', '..ODO..', '.ODhDO.', '.ODDdO.', 'ODhDDdO', 'ODDDDdO', 'OOOOOOO'],
  clean: ['....OO.', '...OnO.', '..OnO..', '.OnO...', 'OqqO...', 'OqqqO..', '.OOOO..'],
  info: ['..OOO..', '..OQO..', '..OOO..', '.OOQO..', '..OQO..', '..OQO..', '.OOOOO.'],
  heart: ['.......', '.OO.OO.', 'OHLOHHO', 'OHHHHHO', '.OHHHO.', '..OHO..', '...O...'],
};

export function requestBubble(icon) {
  return overlay(BUBBLE, ICONS[icon], 2, 1);
}

// ── Small effects ─────────────────────────────────────────────
export const HEART = ['.H.H.', 'HLHHH', 'HHHHH', '.HHH.', '..H..'];

export const SPARKLE = [
  ['.....', '..q..', '.qQq.', '..q..', '.....'],
  ['..q..', '..q..', 'qqQqq', '..q..', '..q..'],
  ['q...q', '.....', '..Q..', '.....', 'q...q'],
];

/** Petting hand seen from above, fingers down (2 frames: left / right). */
export const HAND = [
  ['.OOOOO..', 'OuuuuuO.', 'OuuuuuUO', '.OuOuOO.', '..O.O...'],
  ['..OOOOO.', '.OuuuuuO', 'OUuuuuuO', '.OOuOuO.', '...O.O..'],
];

/** Yarn ball rolling next to a playing cat (2 frames). */
export const YARN = [
  ['.OOO.', 'OyYyO', 'OYyYO', 'OyYyO', '.OOO.'],
  ['.OOO.', 'OYyYO', 'OyYyO', 'OYyYO', '.OOO.'],
];

/** Treat dish shown under a hand-fed cat when no bowl is reachable (8x4). */
export const DISH = ['.OKkKkO.', 'OrrrrrrO', '.OnnnnO.', '..OOOO..'];
