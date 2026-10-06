// Cat toy furniture: hand-authored pixel templates (MIT, like the repo).
// One character = one pixel; PALETTE maps characters to RGBA. The cat sprite
// generator reuses BOX_ROWS and PALETTE so a cat peeking out of the box
// matches the box furniture pixel for pixel.

export const PALETTE = {
  '.': [0, 0, 0, 0],
  o: [46, 28, 32, 255], // outline
  W: [204, 156, 102, 255], // wood
  w: [166, 116, 70, 255],
  v: [120, 80, 48, 255],
  S: [232, 208, 158, 255], // sisal rope
  s: [200, 170, 116, 255],
  r: [156, 124, 80, 255],
  C: [96, 166, 176, 255], // carpeted platform
  c: [64, 124, 138, 255],
  L: [150, 206, 210, 255],
  B: [214, 164, 100, 255], // cardboard
  b: [176, 128, 74, 255],
  k: [92, 60, 40, 255],
  t: [236, 214, 168, 255],
  Y: [232, 96, 124, 255], // yarn
  y: [186, 62, 94, 255],
  z: [250, 164, 180, 255],
  F: [232, 82, 72, 255], // feather
  f: [248, 172, 72, 255],
  G: [250, 224, 112, 255],
  P: [196, 196, 206, 255], // metal pole
  p: [136, 136, 152, 255],
  T: [88, 128, 206, 255], // tunnel fabric
  n: [58, 90, 154, 255],
  u: [244, 204, 92, 255],
  q: [30, 28, 48, 255],
  M: [172, 172, 182, 255], // toy mouse
  m: [122, 122, 136, 255],
  e: [242, 162, 172, 255],
  x: [24, 16, 20, 255],
  R: [204, 104, 92, 255], // cat bed
  Q: [156, 72, 66, 255],
  I: [246, 230, 204, 255],
  i: [216, 196, 166, 255],
};

/** Shared with the cat sheet: the box a cat peeks out of (16x16). */
export const BOX_ROWS = [
  '................',
  '................',
  '.oo..........oo.',
  '.otoo......ootbo',
  '.obttoooooottbo.',
  '..oBkkkkkkkkkbo.',
  '..oBkkkkkkkkkbo.',
  '..oBBBBBBBBBBbo.',
  '..oBBBBttBBBBbo.',
  '..oBBBBttBBBBbo.',
  '..oBBBBBBBBBBbo.',
  '..oBBBBBBBBBBbo.',
  '..obBBBBBBBBbbo.',
  '..obbbbbbbbbbbo.',
  '..ooooooooooooo.',
  '................',
];

/** Inside of the yarn ball (16 px rows 3-11): '#' = wool, '.' = outside. */
const YARN_SHAPE = [
  '...######.......',
  '..########......',
  '.##########.....',
  '.##########.....',
  '.##########.....',
  '.##########.....',
  '.##########.....',
  '..########......',
  '...######.......',
];

/**
 * The loose thread lies flat on the floor as a wavy strand from under the
 * ball (x 6-15, y 13-14). Two shapes: the roll drags it, so it alternates.
 */
const YARN_THREADS = [
  [6, 13, 13, 14, 14, 13, 13, 14, 14, 13],
  [6, 13, 14, 14, 13, 13, 14, 14, 13, 13],
].map(([x0, ...ys]) => ys.map((y, i) => [x0 + i, y]));

/**
 * Ball of yarn at roll phase 0-3: the wound stripes shift one step per
 * phase, so a ball moved by the cat (activity step px) visibly turns.
 */
function yarnFrame(phase) {
  const grid = Array.from({ length: 16 }, () => [...'................']);
  YARN_SHAPE.forEach((row, r) => {
    [...row].forEach((ch, x) => {
      if (ch !== '#') return;
      const y = r + 3;
      const stripe = (x + y + phase) % 4 === 0;
      // Light catches the top left.
      grid[y][x] = stripe ? 'y' : x + r <= 4 ? 'z' : 'Y';
    });
  });
  for (const [x, y] of YARN_THREADS[phase % 2]) grid[y][x] = 'Y';
  // Outline every empty pixel that touches wool or thread.
  const filled = (x, y) => grid[y]?.[x] && grid[y][x] !== '.' && grid[y][x] !== 'o';
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++)
      if (
        grid[y][x] === '.' &&
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dy]) => filled(x + dx, y + dy))
      )
        grid[y][x] = 'o';
  return grid.map((r) => r.join(''));
}

const YARN_FRAMES = [0, 1, 2, 3].map(yarnFrame);

const MOUSE = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '.......oo.......',
  '......oeMo......',
  '....ooMMMMo.....',
  '...oxMMMMMMo....',
  '..oeMMMMMMmmo...',
  '...ooMmmmmmoMo..',
  '.....oooooo.oMo.',
  '..............o.',
  '................',
  '................',
];

const BED = [
  '................',
  '................',
  '................',
  '................',
  '.....oooooo.....',
  '...ooRRRRRRoo...',
  '..oRRQQQQQQRRo..',
  '.oRQIIIIIIIIQRo.',
  '.oRQIiiiiiiIQRo.',
  '.oRQIiiiiiiIQRo.',
  '.oRRQIIIIIIQRRo.',
  '.oRRRRRRRRRRRRo.',
  '.oQRRRRRRRRRRQo.',
  '..oQQQQQQQQQQo..',
  '...oooooooooo...',
  '................',
];

const SCRATCHING_POST = [
  '................',
  '................',
  '................',
  '................',
  '....oooooooo....',
  '...oCLLLLLLCo...',
  '...oCCCCCCCCo...',
  '...occccccccoo..',
  '....oooSSoooYo..',
  '......oSso.oYo..',
  '......orro..o...',
  '......oSso..o...',
  '......oSso.oYo..',
  '......orro.oyo..',
  '......oSso..o...',
  '......oSso......',
  '......orro......',
  '......oSso......',
  '......oSso......',
  '......orro......',
  '......oSso......',
  '......oSso......',
  '......orro......',
  '......oSso......',
  '......oSso......',
  '......orro......',
  '..oooooooooooo..',
  '.oWWWWWWWWWWWWo.',
  '.oWWWWWWWWWWWWo.',
  '.owwwwwwwwwwwwo.',
  '.ovvvvvvvvvvvvo.',
  '..oooooooooooo..',
];

const TEASER = [
  '................',
  '...ooooooo......',
  '..oPPPPPPPoo....',
  '.oPooooooPPo....',
  '.oPo.....oPo....',
  '.oo......oPo....',
  'oGo......oPo....',
  'oGfo.....oPo....',
  'ofFfo....oPo....',
  'oFFfo....oPo....',
  'oFFFo....oPo....',
  '.oFFo....oPo....',
  '.oFo.....oPo....',
  '..o......oPo....',
  '.........oPo....',
  '.........oPo....',
  '.........oPo....',
  '.........oPo....',
  '.........oPo....',
  '.........oPo....',
  '.........oPo....',
  '.........oPo....',
  '.........oPo....',
  '.........oPo....',
  '.........oPo....',
  '.........opo....',
  '.......oopppoo..',
  '......oWWWWWWWo.',
  '......oWWWWWWWo.',
  '......owwwwwwwo.',
  '.......ooooooo..',
  '................',
];

const TUNNEL = [
  '................................',
  '................................',
  '................................',
  '....oooooooooooooooooooooooo....',
  '..ooTTTTuTTTTTTuTTTTTTuTTTTToo..',
  '.oqoTTTTuTTTTTTuTTTTTTuTTTTToqo.',
  'oqqqoTTTuTTTTTTuTTTTTTuTTTToqqqo',
  'oqqqoTTTuTTTTTTuTTTTTTuTTTToqqqo',
  'oqqqoTTTuTTTTTTuTTTTTTuTTTToqqqo',
  'oqqqonnnunnnnnnunnnnnnunnnnoqqqo',
  'oqqqonnnunnnnnnunnnnnnunnnnoqqqo',
  '.oqoonnnunnnnnnunnnnnnunnnnooqo.',
  '..oooooooooooooooooooooooooooo..',
  '................................',
  '................................',
  '................................',
];

/**
 * The tunnel turned a quarter (1x2): it runs away from the viewer, the far
 * mouth a dark slit at the top, the near mouth at the bottom.
 */
const TUNNEL_SIDE = [
  '................',
  '................',
  '...oooooooooo...',
  '..oqqqqqqqqqqo..',
  '.oTqqqqqqqqqqno.',
  '.oTToooooooonno.',
  '.ouuuuuuuuuuuuo.',
  '.oTTTTTTTTnnnno.',
  '.oTTTTTTTTnnnno.',
  '.oTTTTTTTTnnnno.',
  '.oTTTTTTTTnnnno.',
  '.oTTTTTTTTnnnno.',
  '.ouuuuuuuuuuuuo.',
  '.oTTTTTTTTnnnno.',
  '.oTTTTTTTTnnnno.',
  '.oTTTTTTTTnnnno.',
  '.oTTTTTTTTnnnno.',
  '.oTTTTTTTTnnnno.',
  '.ouuuuuuuuuuuuo.',
  '.oTTTTTTTTnnnno.',
  '.oTTTooooooonno.',
  '.oToqqqqqqqqono.',
  '.ooqqqqqqqqqqoo.',
  '.oqqqqqqqqqqqqo.',
  '.oqqqqqqqqqqqqo.',
  '.oqqqqqqqqqqqqo.',
  '.oqqqqqqqqqqqqo.',
  '.ooqqqqqqqqqqoo.',
  '..ooqqqqqqqqoo..',
  '...oooooooooo...',
  '................',
  '................',
];

const CAT_TREE = [
  '................................',
  '................................',
  '................................',
  '................................',
  '.....oooooooooooooooooooooo.....',
  '....oCLLLLLLLLLLLLLLLLLLLLCo....',
  '....oCCCCCCCCCCCCCCCCCCCCCCo....',
  '....oCCCCCCCCCCCCCCCCCCCCCCo....',
  '....occcccccccccccccccccccco....',
  '.....ooooooooSSoooooooooooo.....',
  '............oSso................',
  '............orro................',
  '............oSso................',
  '............oSso................',
  '............orro................',
  '............oSso................',
  '..ooooooooooooSsoooo............',
  '.oCLLLLLLLLLLLLLLLLCo...........',
  '.oCCCCCCCCCCCCCCCCCCo...........',
  '.occcccccccccccccccco...........',
  '..oooooSSooooooooooo..oo........',
  '......oSso...oSso....oYo........',
  '......orro...orro....oyo........',
  '......oSso...oSso.....o.........',
  '......oSso...oSso...............',
  '......orro...orro...............',
  '......oSso...oSso...............',
  '......oSso...oSso...............',
  '......orro...orro...............',
  '......oSso...oSso...............',
  '......oSso...oSso...............',
  '......orro...orro...............',
  '......oSso...oSso...............',
  '......oSso...oSso...............',
  '......orro...orro...............',
  '......oSso...oSso...............',
  '......oSso...oSso...............',
  '......orro...orro...............',
  '..oooooooooooooooooooooooooooo..',
  '.oCLLLLLLLLLLLLLLLLLLLLLLLLLLCo.',
  '.oCCCCCCCCCCCCCCCCCCCCCCCCCCCCo.',
  '.oCCCCCCCCCCCCCCCCCCCCCCCCCCCCo.',
  '.occcccccccccccccccccccccccccco.',
  '.oWWWWWWWWWWWWWWWWWWWWWWWWWWWWo.',
  '.owwwwwwwwwwwwwwwwwwwwwwwwwwwwo.',
  '.ovvvvvvvvvvvvvvvvvvvvvvvvvvvvo.',
  '..oooooooooooooooooooooooooooo..',
  '................................',
];

/**
 * Every toy: one furniture folder with a manifest. footprint and
 * backgroundTiles follow the existing assets (a tall item blocks only its
 * bottom row). `frames`: an animation group (frame 0 = rows), picked by an
 * activity step's `item` (the yarn ball turning as it rolls). `side`: a drawn
 * side view (a 2-way rotation group, the front keeps the toy's id). `rotationScheme:
 * 'symmetric'`: R keeps the toy as it is; any other toy turns as a mirror
 * image (docs/catavasia/furniture.md).
 */
export const TOYS = [
  {
    id: 'SCRATCHING_POST',
    name: 'Scratching Post',
    rows: SCRATCHING_POST,
    fw: 1,
    fh: 2,
    bg: 1,
    rotationScheme: 'symmetric',
  },
  { id: 'CAT_TREE', name: 'Cat Tree', rows: CAT_TREE, fw: 2, fh: 3, bg: 2 },
  {
    id: 'YARN_BALL',
    rotationScheme: 'symmetric',
    name: 'Ball of Yarn',
    rows: YARN_FRAMES[0],
    frames: YARN_FRAMES,
    fw: 1,
    fh: 1,
    bg: 0,
  },
  {
    id: 'CARDBOARD_BOX',
    name: 'Cardboard Box',
    rows: BOX_ROWS,
    fw: 1,
    fh: 1,
    bg: 0,
    rotationScheme: 'symmetric',
  },
  { id: 'FEATHER_TEASER', name: 'Feather Teaser', rows: TEASER, fw: 1, fh: 2, bg: 1 },
  {
    id: 'PLAY_TUNNEL',
    name: 'Play Tunnel',
    rows: TUNNEL,
    fw: 2,
    fh: 1,
    bg: 0,
    // R turns it a quarter: the cat runs through it up and down (2-way).
    side: { rows: TUNNEL_SIDE, fw: 1, fh: 2 },
  },
  { id: 'CAT_BED', name: 'Cat Bed', rows: BED, fw: 1, fh: 1, bg: 0, rotationScheme: 'symmetric' },
  { id: 'TOY_MOUSE', name: 'Toy Mouse', rows: MOUSE, fw: 1, fh: 1, bg: 0 },
];
