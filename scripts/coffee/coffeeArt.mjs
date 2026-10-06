// Coffee corner furniture (16x16, placed on a counter or desk): espresso
// machine, drip coffee maker, pour-over cone with a gooseneck kettle, French
// press, moka pot, electric kettle and a stack of cups. Hand-authored pixel
// templates, MIT like the rest of the repo.
//
// Every brewer has 7 frames, picked by the cat's "make coffee" steps:
//   0 idle (empty cup in place)   1 switched on / started
//   2-4 brewing (stream, rising level)   5 done (full, steam)   6 cup taken

export const PALETTE = {
  o: [46, 28, 32, 255],
  K: [62, 60, 74, 255],
  k: [92, 90, 108, 255],
  j: [132, 130, 150, 255],
  R: [206, 74, 66, 255],
  r: [150, 50, 50, 255],
  q: [238, 124, 106, 255],
  M: [206, 210, 220, 255],
  m: [150, 154, 168, 255],
  n: [104, 108, 124, 255],
  W: [248, 244, 234, 255],
  w: [206, 198, 186, 255],
  C: [98, 58, 36, 255],
  c: [180, 124, 72, 255],
  G: [196, 230, 242, 255],
  g: [146, 198, 216, 255],
  L: [130, 240, 120, 255],
  l: [72, 98, 72, 255],
  T: [86, 178, 168, 255],
  t: [52, 124, 120, 255],
  B: [192, 138, 88, 255],
  b: [140, 94, 58, 255],
  P: [246, 238, 216, 255],
  s: [246, 246, 252, 200],
  Y: [236, 196, 92, 255],
  '.': [0, 0, 0, 0],
};

/** rows with cells (x, y) set to ch; out-of-range cells are ignored. */
function put(rows, cells) {
  const out = rows.map((r) => [...r]);
  for (const [x, y, ch] of cells) if (out[y]?.[x] !== undefined) out[y][x] = ch;
  return out.map((r) => r.join(''));
}

/** 7 frames from a base and a per-frame list of cell edits. */
function frames(base, edits) {
  return edits.map((cells) => put(base, cells));
}

// ── Espresso machine (red, retro) ───────────────────────────────────────
const ESPRESSO = [
  '................',
  '..oooooooooooo..',
  '.oqqqqqqqqqqqqo.',
  '.oRRRRRRRRRRRRo.',
  '.oRrrrrrrrrrrRo.',
  '.oRRRRRRRRRRRRo.',
  '.oRRooooooollRo.',
  '.oRRonMMMMnoRRo.',
  '.oRRKooMMooKRRo.',
  '.oRRKKKoMoKKRRo.',
  '.oRRKKKKKKKKRRo.',
  '.oRRKKooooKKRRo.',
  '.oRRKKoWWooKRRo.',
  '.oRRKKoWWoKKRRo.',
  '.oRRmmooooommRo.',
  '..ooooooooooooo.',
];
const ESP_CUP_GONE = [
  [6, 11, 'K'],
  [7, 11, 'K'],
  [8, 11, 'K'],
  [9, 11, 'K'],
  [6, 12, 'K'],
  [7, 12, 'K'],
  [8, 12, 'K'],
  [9, 12, 'K'],
  [10, 12, 'K'],
  [6, 13, 'K'],
  [7, 13, 'K'],
  [8, 13, 'K'],
  [9, 13, 'K'],
  [6, 14, 'm'],
  [7, 14, 'm'],
  [8, 14, 'm'],
  [9, 14, 'm'],
  [10, 14, 'm'],
];
const LEDS = [
  [11, 6, 'L'],
  [12, 6, 'L'],
];
const ESPRESSO_FRAMES = frames(ESPRESSO, [
  [],
  [...LEDS],
  [...LEDS, [8, 10, 'C'], [7, 11, 'w']],
  [...LEDS, [8, 10, 'C'], [7, 11, 'C'], [8, 11, 'w']],
  [...LEDS, [8, 10, 'C'], [7, 11, 'C'], [8, 11, 'C']],
  [
    [7, 11, 'c'],
    [8, 11, 'c'],
    [10, 9, 's'],
    [11, 8, 's'],
    [10, 7, 's'],
  ],
  ESP_CUP_GONE,
]);

// ── Drip coffee maker (black, glass carafe) ─────────────────────────────
const DRIP = [
  '...ooooooooo....',
  '..okkkkkkkkko...',
  '..oKKKKKKKKKKo..',
  '..oKKoooooKKKo..',
  '..oKKKoPoKKKKo..',
  '..oKKKKoKKKKlo..',
  '..oKKK...KKKKo..',
  '..oKKooooooKKo..',
  '..oKoGGGGGGoKo..',
  '..oKoGgggggoGoo.',
  '..oKoGgggggoKGo.',
  '..oKoGgggggoGoo.',
  '..oKooGGGGooKo..',
  '..onnnooooonnno.',
  '..oooooooooooooo',
  '................',
];
const CARAFE = (level) => {
  const cells = [];
  for (let y = 11; y > 11 - level; y--) for (let x = 6; x <= 10; x++) cells.push([x, y, 'C']);
  return cells;
};
const DRIP_FRAMES = frames(DRIP, [
  [],
  [[12, 5, 'L']],
  [[12, 5, 'L'], [7, 6, 'C'], [7, 7, 'C'], ...CARAFE(1)],
  [[12, 5, 'L'], [7, 6, 'C'], [7, 7, 'C'], ...CARAFE(2)],
  [[12, 5, 'L'], [7, 6, 'C'], [7, 7, 'C'], ...CARAFE(3)],
  [[12, 5, 'L'], ...CARAFE(3), [4, 0, 's'], [5, 0, 's']],
  [[12, 5, 'L'], ...CARAFE(2)],
]);

// ── Pour-over: V60 cone on a wooden stand, gooseneck kettle on the left ─
const POUR = [
  '................',
  '................',
  '................',
  '........oooooooo',
  '..oo....oPPPPPPo',
  '.oTTo....oPPPPo.',
  'oTTTTo..o.oPPo..',
  'oTTTTTooTooBBo..',
  'oKTTTTTTo.oBBooo',
  'oKTTTTTo.oGGGGo.',
  'otttttto.oGggGo.',
  '.otttto..oGggGo.',
  '..oooo...oGggGo.',
  '.........ooGGoo.',
  '........obbbbbbo',
  '........oooooooo',
];
/** The kettle lifted up and right so its spout tips over the cone. */
function lifted(rows) {
  const out = rows.map((r) => [...r]);
  for (let y = 4; y <= 12; y++) for (let x = 0; x <= 8; x++) out[y][x] = '.';
  for (let y = 4; y <= 12; y++)
    for (let x = 0; x <= 8; x++) {
      const ch = rows[y][x];
      if (ch !== '.' && out[y - 3]?.[x + 1] !== undefined) out[y - 3][x + 1] = ch;
    }
  return out.map((r) => r.join(''));
}
const POUR_LIFTED = lifted(POUR);
const SERVER = (level) => {
  const cells = [];
  for (let y = 12; y > 12 - level; y--) for (let x = 11; x <= 12; x++) cells.push([x, y, 'C']);
  return cells;
};
const WATER = [
  [10, 4, 'g'],
  [11, 4, 'C'],
];
const POUR_FRAMES = [
  POUR,
  put(POUR_LIFTED, []),
  put(POUR_LIFTED, [...WATER, [12, 9, 'C'], ...SERVER(1)]),
  put(POUR_LIFTED, [...WATER, [12, 4, 'C'], [12, 9, 'C'], ...SERVER(2)]),
  put(POUR, [[11, 4, 'C'], [12, 4, 'C'], [12, 9, 'C'], ...SERVER(3)]),
  put(POUR, [...SERVER(3), [12, 1, 's'], [13, 2, 's'], [12, 0, 's']]),
  put(POUR, [...SERVER(1)]),
];

// ── French press ────────────────────────────────────────────────────────
const PRESS = [
  '......oo........',
  '......oo........',
  '....oooooo......',
  '...oMMMMMMo.....',
  '...oGGGoGGooo...',
  '...oGgGoGGo.o...',
  '...oGgGoGGo.o...',
  '...oGgGoGGo.o...',
  '...oGgGoGGo.o...',
  '...oGgGoGGooo...',
  '...oGgGGGGo.....',
  '...oGGGGGGo.....',
  '...ommmmmmo.....',
  '...oooooooo.....',
  '................',
  '................',
];
const PRESS_FILL = (top) => {
  const cells = [];
  for (let y = top; y <= 11; y++)
    for (let x = 4; x <= 9; x++) if (x !== 7 || y > 9) cells.push([x, y, 'C']);
  return cells;
};
const PLUNGER = (down) => [
  [6, 0 + down, 'o'],
  [7, 0 + down, 'o'],
  [6, 1 + down, 'n'],
  [7, 1 + down, 'n'],
];
const PRESS_FRAMES = frames(PRESS, [
  [],
  [...PRESS_FILL(9)],
  [...PRESS_FILL(5), ...PLUNGER(1)],
  [...PRESS_FILL(5), ...PLUNGER(2), [4, 5, 'c'], [5, 5, 'c']],
  [...PRESS_FILL(5), ...PLUNGER(3), [4, 9, 'c'], [5, 9, 'c'], [8, 9, 'c'], [9, 9, 'c']],
  [...PRESS_FILL(5), ...PLUNGER(3), [12, 1, 's'], [13, 0, 's']],
  [...PRESS_FILL(9), ...PLUNGER(3)],
]);

// ── Moka pot (aluminium, black handle) on a little burner ───────────────
const MOKA = [
  '................',
  '.......o........',
  '......oMoo......',
  '.....oMMMMo.....',
  '....oMMMMMMooo..',
  '....onnnnnnoKo..',
  '.....oMMMMoKKo..',
  '.....omMMmooo...',
  '....oMMMMMMo....',
  '....omMMMMmo....',
  '....omMMMMmo....',
  '....onmmmmno....',
  '...oooooooooo...',
  '...okkkkkkkko...',
  '...oooooooooo...',
  '................',
];
const FLAME = [
  [5, 12, 'Y'],
  [7, 12, 'Y'],
  [9, 12, 'Y'],
];
const MOKA_FRAMES = frames(MOKA, [
  [],
  [...FLAME],
  [...FLAME, [7, 0, 's']],
  [...FLAME, [6, 0, 's'], [8, 0, 's'], [7, 1, 'C']],
  [...FLAME, [7, 0, 's'], [5, 1, 's'], [9, 0, 's'], [7, 1, 'C']],
  [
    [7, 0, 's'],
    [8, 0, 's'],
  ],
  [],
]);

// ── Electric kettle (cream, blue water window) ──────────────────────────
const KETTLE = [
  '................',
  '.......oo.......',
  '.....ooKKoo.....',
  '....oWWWWWWo....',
  '...oWWWWWWWWoo..',
  '..oWWWWWWWWWWKo.',
  '..oWWgGWWWWWWoKo',
  '.oWWWgGWWWWWWoKo',
  'oWoWWgGWWWWWWoKo',
  '.o.oWgGWWWWWWoKo',
  '...owgGwwwwwwoo.',
  '...owwwwwwwwwo..',
  '...oooooooooooo.',
  '...oKKKKKKKKKKo.',
  '...ooooooolllo..',
  '................',
];
const KETTLE_FRAMES = frames(KETTLE, [
  [],
  [
    [10, 14, 'L'],
    [11, 14, 'L'],
    [12, 14, 'L'],
  ],
  [
    [10, 14, 'L'],
    [11, 14, 'L'],
    [12, 14, 'L'],
    [5, 6, 'G'],
    [5, 7, 'G'],
  ],
  [
    [10, 14, 'L'],
    [11, 14, 'L'],
    [12, 14, 'L'],
    [0, 7, 's'],
    [1, 6, 's'],
  ],
  [
    [10, 14, 'L'],
    [11, 14, 'L'],
    [12, 14, 'L'],
    [0, 7, 's'],
    [1, 5, 's'],
    [0, 4, 's'],
  ],
  [
    [0, 6, 's'],
    [1, 4, 's'],
  ],
  [],
]);

// ── Stack of cups (static) ──────────────────────────────────────────────
const CUPS = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '..oooo..........',
  '.oRRRRo...oooo..',
  '.orrrroo.oWWWWo.',
  '.oRRRRo..oWWWWoo',
  '.oRRRRoo.owwwwo.',
  '.oRRRRo..oWWWWoo',
  '..oooo...oWWWWo.',
  '.........oWWWWo.',
  '..........oooo..',
  '................',
  '................',
];

/**
 * Every coffee item: one furniture folder. A brewer's manifest is an
 * animation group (frames hidden from the catalog; the cats pick them).
 */
export const COFFEE_ITEMS = [
  { id: 'ESPRESSO_MACHINE', name: 'Espresso Machine', frames: ESPRESSO_FRAMES },
  { id: 'DRIP_COFFEE_MAKER', name: 'Drip Coffee Maker', frames: DRIP_FRAMES },
  { id: 'POUR_OVER', name: 'Pour-over and Kettle', frames: POUR_FRAMES },
  { id: 'FRENCH_PRESS', name: 'French Press', frames: PRESS_FRAMES },
  { id: 'MOKA_POT', name: 'Moka Pot', frames: MOKA_FRAMES },
  { id: 'ELECTRIC_KETTLE', name: 'Electric Kettle', frames: KETTLE_FRAMES },
  { id: 'COFFEE_MUGS', name: 'Coffee Mugs', frames: [CUPS] },
];
