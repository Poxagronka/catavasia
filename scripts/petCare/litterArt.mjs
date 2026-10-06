// Litter box variants as ASCII templates (one char = one pixel, '.' empty).
// Composed into fill-state sprites by scripts/generate-pet-care-sprites.mjs.
// Template marks: '#' = litter sand (painted per sand stage), '@' = the smart
// box status light (green / amber / red by fill). MIT like the rest of the repo.

import { overlay } from './art.mjs';

/** Colors the litter art adds to the pet-care palette (art.mjs PALETTE). */
export const LITTER_PALETTE = {
  // sand: a fresh glint, a stain, a wet clump
  Z: '#fbf3d5',
  x: '#9c8a5c',
  z: '#8d7a52',
  // high-sided box (coral)
  R: '#f0907a',
  V: '#c8604e',
  v: '#9a4436',
  // corner box (lavender)
  I: '#c3b2e8',
  J: '#9580c8',
  j: '#66549c',
  // smart box (white plastic, steel rake) and its status lights
  X: '#f4f4f0',
  l: '#c9ccd2',
  m: '#8a8f99',
  C: '#6fe07a',
  o: '#f2b632',
  t: '#e8504a',
  // hooded box (dusty blue), its dark doorway and the open flap
  '+': '#a9c6e8',
  '=': '#6d93c4',
  '-': '#4a6b9c',
  '%': '#2a2433',
  '^': '#dce8f6',
  // poop bag, litter scoop
  '&': '#5f9a3a',
};

// ── Variants (16x16, 1x1 footprint, the tile stays walkable) ────────────
// lipTop: first row of the front wall. The webview draws rows from lipTop
// down once more in front of a cat on the tile, so the cat stands IN the box.
// piles: top-left px of each pile, in the order they appear (1..5).

const OPEN = [
  '................',
  '................',
  '................',
  '................',
  '.OOOOOOOOOOOOOO.',
  'OTTTTTTTTTTTTTTO',
  'OT############TO',
  'OT############TO',
  'OT############TO',
  'OPPPPPPPPPPPPPPO',
  'OppppppppppppppO',
  'OppppppppppppppO',
  '.OOOOOOOOOOOOOO.',
  '................',
  '................',
  '................',
];

const HIGH = [
  '................',
  '..OOOOOOOOOOOO..',
  '.ORRRRRRRRRRRRO.',
  'ORvvvvvvvvvvvvRO',
  'ORv##########vRO',
  'ORv##########vRO',
  'ORRRRRRRRRRRRRRO',
  'OVVVVVVVVVVVVVVO',
  'OVVVVVVQVQVVVVVO',
  'OVVVVVQQQQQVVVVO',
  'OVVVVVVQQQVVVVVO',
  'OvvvvvvvvvvvvvvO',
  '.OOOOOOOOOOOOOO.',
  '................',
  '................',
  '................',
];

const CORNER = [
  '................',
  '................',
  '................',
  '.OOOOOOOOOOOOOO.',
  'OIIIIIIIIIIIIIIO',
  'OI############IO',
  'OI############IO',
  'OI###########JjO',
  'OI##########JjO.',
  'OJJJJJJJJJJJjO..',
  'OjjjjjjjjjjjO...',
  'OjjjjjjjjjjO....',
  '.OOOOOOOOOO.....',
  '................',
  '................',
  '................',
];

const SMART = [
  '................',
  '................',
  '...OOOOOOOOOO...',
  '..OXXXXXXXXXXO..',
  '.OXmmmmmmmmmmXO.',
  'OXl##########lXO',
  'OXl##########lXO',
  'OXl##########lXO',
  'OXXXXXXXXXXXXXXO',
  'OllllllllllllllO',
  'Olll@llmmmmmlllO',
  'OllllllllllllllO',
  '.OOOOOOOOOOOOOO.',
  '................',
  '................',
  '................',
];

const HOOD = [
  '................',
  '....OOOOOOOO....',
  '..OO++++++++OO..',
  '.O++++++++++++O.',
  '.O+++++++++++=O.',
  'O++++OOOOOO++==O',
  'O+++O^^^^^^O+==O',
  'O+++O%%%%%%O+==O',
  'O+++O%%%%%%O===O',
  'O+++O%%%%%%O===O',
  'O===O%%%%%%O===O',
  'O--------------O',
  'O-PPPPPPPPPPPP-O',
  '.OOOOOOOOOOOOOO.',
  '................',
  '................',
];

export const LITTER_VARIANTS = [
  {
    id: 'LITTER_BOX',
    rotationScheme: 'symmetric',
    name: 'Litter box (open tray)',
    rows: OPEN,
    lipTop: 9,
    piles: [
      [6, 6],
      [10, 5],
      [3, 6],
      [8, 7],
      [11, 7],
    ],
  },
  {
    id: 'LITTER_BOX_HOODED',
    name: 'Litter box (hooded)',
    rows: HOOD,
    lipTop: 11,
    hooded: true,
    // Only the doorway shows the inside: piles sit at its foot.
    piles: [
      [6, 8],
      [8, 8],
      [7, 7],
      [5, 9],
      [9, 9],
    ],
  },
  {
    id: 'LITTER_BOX_CORNER',
    name: 'Litter box (corner)',
    rows: CORNER,
    lipTop: 9,
    piles: [
      [5, 5],
      [9, 5],
      [3, 6],
      [7, 6],
      [10, 6],
    ],
  },
  {
    id: 'LITTER_BOX_SMART',
    name: 'Litter box (smart)',
    rows: SMART,
    lipTop: 8,
    piles: [
      [6, 5],
      [9, 5],
      [3, 5],
      [7, 6],
      [10, 6],
    ],
  },
  {
    id: 'LITTER_BOX_HIGH',
    rotationScheme: 'symmetric',
    name: 'Litter box (high-sided)',
    rows: HIGH,
    lipTop: 6,
    piles: [
      [6, 3],
      [9, 3],
      [3, 3],
      [7, 4],
      [10, 4],
    ],
  },
];

// ── Fill and sand stages ────────────────────────────────────────────────
/** Pile art: a small swirl and a flatter clump. */
const PILE = ['.Dd.', 'DhDd', 'dDDd'];
const CLUMP = ['.dd.', 'dDhd'];

/** Sand stages: fresh (just changed), used, dirty (change me). */
export const SAND_STAGES = ['fresh', 'used', 'dirty'];

function sandAt(stage, x, y) {
  const h = (x * 7 + y * 13 + x * y) % 11;
  if (stage === 'fresh') return h === 0 || h === 6 ? 'Z' : h === 5 ? 's' : 'S';
  if (stage === 'used') return h === 0 || h === 3 || h === 7 ? 's' : h === 9 ? 'c' : 'S';
  return h === 0 || h === 4 ? 'c' : h === 8 ? 'x' : h === 2 || h === 6 ? 'S' : 's';
}

/** Status light by pile count: green while clean, amber, red once full. */
function lightFor(piles) {
  return piles >= 4 ? 't' : piles >= 2 ? 'o' : 'C';
}

/**
 * One fill-state sprite: `piles` (0..5) piles on `sand` litter. Five piles
 * spill over: one sits on the rim and litter is kicked out onto the floor.
 */
export function litterBox(variant, piles, sand) {
  let rows = variant.rows.map((row, y) =>
    [...row]
      .map((ch, x) => (ch === '#' ? sandAt(sand, x, y) : ch === '@' ? lightFor(piles) : ch))
      .join(''),
  );
  for (let i = 0; i < piles; i++) {
    const [px, py] = variant.piles[i];
    rows = overlay(rows, i % 2 ? CLUMP : PILE, px, py);
  }
  if (piles >= 5) {
    const rim = variant.lipTop;
    rows = overlay(rows, PILE, 11, rim - 2);
    rows = overlay(rows, ['S.s...Z', '..S.s..'], 2, Math.min(15, rim + 4));
  }
  return rows;
}

// ── Care effects ────────────────────────────────────────────────────────
/** A fly, wings up / down (drawn semi-transparent, orbiting the mess). */
export const FLY = [
  ['Q.Q', '.i.'],
  ['...', 'QiQ'],
];

/** The litter scoop (Clean): above the box, sifting (sand falls through the slots), a clump lifted out. */
export const SCOOP = [
  ['.......OO', '......OnO', '.....OnO.', 'OOOOOnO..', 'OlmlmlO..', 'OlllllO..', '.OOOOO...'],
  [
    '.......OO',
    '......OnO',
    '.....OnO.',
    'OOOOOnO..',
    'OlSlSlO..',
    'OlllllO..',
    '.OSOSO...',
    '..S.S....',
  ],
  ['.......OO', '......OnO', '.OOO.OnO.', 'ODhdOnO..', 'OlDdmlO..', 'OlllllO..', '.OOOOO...'],
];

/** The poop bag (Clean up): open over the pile, closed round it, tied and lifted away. */
export const BAG = [
  ['...OO...', '..OuuO..', '..OuUO..', '.O&OO&O.', 'O&....&O', 'O&....&O', '.O&&&&O.'],
  ['...OO...', '..OuuO..', '..OuUO..', '.OO&&OO.', 'O&&&&&&O', 'O&&D&&&O', '.OOOOOO.'],
  ['...OO...', '..OuuO..', '..O&&O..', '..O&&O..', '.O&&&&O.', 'O&&D&&&O', 'O&&&&&&O', '.OOOOOO.'],
];

/** A bag of fresh litter (Change litter), tipped over the box, the sand stream flickering. */
const POUR_BAG = [
  '.OOOOOO..',
  'OQQQQQQO.',
  'OQBBBBQO.',
  'OQBQQBQO.',
  'OQBBBBQO.',
  'OQQQQQlO.',
  '.OlQQlO..',
  '..OSSO...',
];
export const POUR = [
  [...POUR_BAG, '...SS....', '...SS....', '....S....', '...S.....'],
  [...POUR_BAG, '...SS....', '....S....', '...SS....', '....S....'],
];
