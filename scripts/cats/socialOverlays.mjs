// Shared overlays for cat social scenes: pictogram speech bubbles, the anger
// mark and the fight dust cloud. Hand-authored pixel templates plus a
// procedural cloud; MIT like the rest of the repo.
//
// Palette keys are single characters. 'A' / 'B' are placeholders the webview
// replaces with the two fighting cats' fur colours at render time.

export const OVERLAY_PALETTE = {
  '.': '',
  o: '#555566', // bubble border (matches the permission / waiting bubbles)
  w: '#EEEEFF', // bubble fill
  r: '#E64566', // heart
  s: '#FFB3C4', // heart / highlight
  b: '#4A90D9', // fish
  d: '#2C5A8C', // fish shade
  k: '#3A3A4A', // text, eyes
  g: '#9A9AA8', // mouse
  G: '#6E6E7E', // mouse shade
  p: '#F2A0B0', // mouse ear / nose / tail
  R: '#E03C3C', // anger mark, "!"
  D: '#8C1C1C', // anger mark shade
  y: '#FFE066', // star
  Y: '#E0A020', // star edge
  c: '#F4F0E8', // cloud
  C: '#D2CABE', // cloud shade
  O: '#6B6258', // cloud outline
  x: '#2E1C20', // cat outline (paws, tails)
  A: 'furA',
  B: 'furB',
};

// ── Pictograms (drawn inside the bubble) ─────────────────────────────
const ICONS = {
  fish: ['..bbb....', '.bbbbb..b', 'bkbbbbbbb', '.ddddd..d', '..ddd....'],
  heart: ['.rr.rr.', 'rsrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'],
  question: ['.kkkk.', 'kk..kk', '...kk.', '..kk..', '..kk..', '......', '..kk..'],
  exclaim: ['RR', 'RR', 'RR', 'RR', '..', 'RR'],
  // "мяу" in a 3-px lowercase pixel font (у has a descender).
  meow: ['k...k.kkk.k.k', 'kk.kk.k.k.k.k', 'k.k.k..kk..kk', 'k...k.k.k...k', '..........kk.'],
  mouse: ['...gg....', '..gpg....', '.gkgggg..', 'pggggggg.', '.GGGGGGGp', '..k..k.p.'],
};

const BUBBLE_W = 17;
const BUBBLE_INNER_H = 8;

/** A speech bubble (17x12) with the pictogram centred inside. */
function bubble(icon) {
  const rows = [];
  rows.push('.' + 'o'.repeat(BUBBLE_W - 2) + '.');
  const top = 1 + Math.floor((BUBBLE_INNER_H - icon.length) / 2);
  const left = 1 + Math.floor((BUBBLE_W - 2 - icon[0].length) / 2);
  for (let y = 0; y < BUBBLE_INNER_H; y++) {
    const line = ['o', ...'w'.repeat(BUBBLE_W - 2), 'o'];
    const iy = y + 1 - top;
    if (iy >= 0 && iy < icon.length)
      [...icon[iy]].forEach((k, ix) => {
        if (k !== '.') line[left + ix] = k;
      });
    rows.push(line.join(''));
  }
  rows.push('.' + 'o'.repeat(BUBBLE_W - 2) + '.');
  const mid = Math.floor(BUBBLE_W / 2);
  rows.push('.'.repeat(mid - 1) + 'owo' + '.'.repeat(BUBBLE_W - mid - 2));
  rows.push('.'.repeat(mid) + 'o' + '.'.repeat(BUBBLE_W - mid - 1));
  return rows;
}

// ── Anger mark (the cartoon "cross vein"), two pulse frames ──────────
const ANGER_BASE = [
  '..RR.RR..',
  '..RR.RR..',
  'RRRD.DRRR',
  'RRD...DRR',
  '.........',
  'RRD...DRR',
  'RRRD.DRRR',
  '..RR.RR..',
  '..RR.RR..',
];
/** Frame 2 flashes: shade and fill swap. */
const ANGER = [
  ANGER_BASE,
  ANGER_BASE.map((r) => r.replace(/[RD]/g, (k) => (k === 'R' ? 'D' : 'R'))),
];

// ── Fight dust cloud: 36x28, four frames ─────────────────────────────
const CLOUD_W = 36;
const CLOUD_H = 28;

/** Puffs (cx, cy, r) per frame: the cloud boils by moving them a little. */
const PUFFS = [
  [
    [10, 16, 7],
    [18, 11, 8],
    [27, 15, 7],
    [14, 21, 6],
    [23, 21, 6],
  ],
  [
    [9, 15, 7],
    [18, 12, 8],
    [28, 16, 6],
    [13, 21, 6],
    [24, 20, 7],
  ],
  [
    [11, 16, 6],
    [17, 11, 8],
    [26, 14, 8],
    [15, 21, 7],
    [24, 22, 6],
  ],
  [
    [10, 14, 7],
    [19, 12, 7],
    [27, 16, 7],
    [13, 20, 7],
    [22, 21, 6],
  ],
];

const STAR = ['..y..', '.yyy.', 'yyYyy', '.yyy.', '..y..'];
const SPARK = ['.y.', 'yYy', '.y.'];
const PAW = ['.xxx.', 'xAxAx', 'xAAAx', '.xxx.'];
const PAW_B = ['.xxx.', 'xBxBx', 'xBBBx', '.xxx.'];

/** [template, x, y] decorations per frame: stars, paws and tails poke out. */
const DECOR = [
  [
    [STAR, 3, 3],
    [SPARK, 30, 6],
    [PAW, 0, 18],
    [PAW_B, 30, 20],
  ],
  [
    [STAR, 28, 1],
    [SPARK, 2, 9],
    [PAW_B, 5, 23],
    [PAW, 26, 0],
  ],
  [
    [STAR, 1, 8],
    [STAR, 29, 18],
    [PAW, 14, 0],
    [PAW_B, 1, 22],
  ],
  [
    [SPARK, 15, 1],
    [STAR, 30, 4],
    [PAW_B, 0, 13],
    [PAW, 24, 23],
  ],
];

/** Swirl stroke origins per frame. */
const SWIRLS = [
  [
    [12, 14],
    [21, 18],
  ],
  [
    [15, 12],
    [20, 19],
  ],
  [
    [11, 17],
    [22, 13],
  ],
  [
    [14, 13],
    [19, 18],
  ],
];

/** Tail strokes (fur key, points) per frame. */
const TAILS = [
  [
    [
      'A',
      [
        [5, 4],
        [3, 2],
        [3, 0],
      ],
    ],
    [
      'B',
      [
        [31, 14],
        [34, 13],
        [35, 10],
      ],
    ],
  ],
  [
    [
      'B',
      [
        [24, 2],
        [26, 0],
      ],
    ],
    [
      'A',
      [
        [3, 17],
        [1, 16],
        [0, 13],
      ],
    ],
  ],
  [
    [
      'A',
      [
        [32, 12],
        [34, 10],
        [35, 7],
      ],
    ],
    [
      'B',
      [
        [8, 4],
        [6, 2],
        [7, 0],
      ],
    ],
  ],
  [
    [
      'B',
      [
        [30, 21],
        [33, 22],
        [35, 20],
      ],
    ],
    [
      'A',
      [
        [5, 3],
        [3, 1],
      ],
    ],
  ],
];

function cloudFrame(f) {
  const g = Array.from({ length: CLOUD_H }, () => new Array(CLOUD_W).fill('.'));
  const put = (x, y, k) => {
    if (x >= 0 && y >= 0 && x < CLOUD_W && y < CLOUD_H) g[y][x] = k;
  };
  const inside = (x, y) => PUFFS[f].some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r);
  // Tails first, so the cloud body covers their roots.
  for (const [key, pts] of TAILS[f]) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let s = 0; s <= n; s++) {
        const x = Math.round(x0 + ((x1 - x0) * s) / n);
        const y = Math.round(y0 + ((y1 - y0) * s) / n);
        put(x, y, key);
        put(x + 1, y, key);
      }
    }
  }
  for (let y = 0; y < CLOUD_H; y++)
    for (let x = 0; x < CLOUD_W; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x + 1, y) || !inside(x - 1, y) || !inside(x, y + 1) || !inside(x, y - 1);
      const shade = !inside(x, y + 2) || (!inside(x + 2, y) && y > 14);
      put(x, y, edge ? 'O' : shade ? 'C' : 'c');
    }
  // Outline the tails where they leave the cloud.
  const tailCells = [];
  for (let y = 0; y < CLOUD_H; y++)
    for (let x = 0; x < CLOUD_W; x++)
      if (g[y][x] === 'A' || g[y][x] === 'B') tailCells.push([x, y]);
  for (const [x, y] of tailCells)
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      if (g[y + dy]?.[x + dx] === '.') put(x + dx, y + dy, 'x');
  // Scuffle swirls inside the cloud body.
  for (const [sx, sy] of SWIRLS[f]) {
    for (const [dx, dy] of [
      [0, 0],
      [1, -1],
      [2, -1],
      [3, 0],
      [3, 1],
    ])
      if (inside(sx + dx, sy + dy)) put(sx + dx, sy + dy, 'C');
  }
  for (const [tpl, ox, oy] of DECOR[f])
    tpl.forEach((row, y) => [...row].forEach((k, x) => k !== '.' && put(ox + x, oy + y, k)));
  return g.map((row) => row.join(''));
}

/** name -> frames (each a list of row strings in OVERLAY_PALETTE keys). */
export function renderOverlays() {
  const out = {};
  for (const [name, icon] of Object.entries(ICONS)) out[`bubble_${name}`] = [bubble(icon)];
  out.anger = ANGER;
  out.cloud = [0, 1, 2, 3].map(cloudFrame);
  return out;
}
