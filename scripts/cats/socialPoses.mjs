// Social poses drawn as activity frames: a nose boop, a head rub, the
// side-on standoff before a fight, and a happy tail flick while listening.
// Side poses face right (left is mirrored); boop, rub and flick have front
// and back versions too, so two cats facing each other up / down use them.

import { drawHead, tail, Z } from './parts.mjs';
import { frontSit } from './restPoses.mjs';
import { sitSide } from './sideKit.mjs';

/** Leaning in: the head 1 px forward and down, eyes shut (boop) or happy (rub). */
function lean(fr, dir, cat, rub) {
  const head = rub ? { eyes: 'happy' } : { eyes: 'closed' };
  if (dir === 'right') {
    sitSide(fr, cat, { head, headDx: rub ? 2 : 1, headDy: rub ? 2 : 1 });
  } else if (dir === 'down') {
    frontSit(fr, cat, { head, fy: rub ? 12 : 11 });
  } else {
    backTail(fr, cat, 0, rub ? 2 : 1);
  }
}

/** Sitting with the back to the viewer, tail tip at `flick`, head lowered by `dy`. */
function backTail(fr, cat, flick, dy = 0) {
  const fy = 8;
  drawHead(fr, 'up', 2, fy + dy, cat);
  fr.stamp(
    [
      '.FFFFFF.',
      'CCCCCCCC',
      'fFFFFFFf',
      'fFFhhFFf',
      'fFFFFFFf',
      'fFFFFFFf',
      'fFFFFFFf',
      'ffFFFFff',
    ],
    4,
    fy + 8,
    'torso',
    Z.torso,
  );
  fr.rect(4, fy + 16, 8, 2, 'legL', Z.leg);
  tail(
    fr,
    cat,
    [
      [8, fy + 16],
      [11, fy + 17],
      [13, fy + 14],
      [13 + flick, fy + 10],
    ],
    true,
  );
}

/** Listening happily: the tail stands up and its tip flicks. */
function flick(fr, dir, cat, f) {
  if (dir === 'right') {
    sitSide(fr, cat, { head: { eyes: 'happy' }, tail: f ? 'flick' : 'up' });
  } else if (dir === 'down') {
    frontSit(fr, cat, {
      head: { eyes: 'happy' },
      tailPts: [
        [10, 29],
        [13, 28],
        [14, 24],
        [14 - f, 21],
      ],
    });
  } else {
    backTail(fr, cat, f);
  }
}

/**
 * Arched torso behind the head (Halloween cat): a round inverted-U topline
 * that peaks at row `top` over the middle and falls `drop` px to the rump
 * (x0) and the shoulders (x1). The body fills down to row `bottom`.
 */
function archTorso(fr, x0, x1, top, drop, bottom) {
  const mid = (x0 + x1) / 2;
  const half = (x1 - x0) / 2 + 0.5;
  for (let x = x0; x <= x1; x++) {
    const u = (x - mid) / half;
    const y0 = top + Math.round(drop * (1 - Math.sqrt(1 - u * u)));
    for (let y = y0; y <= bottom; y++) {
      fr.set(x, y, { label: 'fur', part: 'torso', lx: x - x0, ly: y - top, z: Z.torso });
    }
  }
}

const SIDES = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
];

/**
 * Piloerection: fur on end around every cell of `parts`. Every `every`-th
 * empty cell on the silhouette edge grows a tuft `len` px long out of the
 * fur next to it, so the outline pass turns the edge into a jagged zig-zag.
 * Tufts never touch a leg. `phase` shifts them (shimmer); `keep(x, y)`
 * limits where they grow.
 */
function bristle(fr, parts, { every, len, phase = 0, keep = () => true }) {
  const at = (x, y) => fr.cells[y]?.[x] ?? null;
  const free = (x, y) =>
    x >= 0 &&
    x < 16 &&
    y >= 0 &&
    !at(x, y) &&
    keep(x, y) &&
    !SIDES.some(([dx, dy]) => at(x + dx, y + dy)?.part.startsWith('leg'));
  const tufts = [];
  fr.cells.forEach((row, y) =>
    row.forEach((_c, x) => {
      if (!free(x, y)) return;
      const side = SIDES.findIndex(([dx, dy]) => parts.has(at(x + dx, y + dy)?.part));
      if (side < 0) return;
      // Along a top / bottom edge tufts alternate by column, along a side by row.
      if (((side < 2 ? x : y) + phase) % every !== 0) return;
      const [dx, dy] = SIDES[side];
      tufts.push([x, y, -dx, -dy, at(x + dx, y + dy)]);
    }),
  );
  for (const [x, y, nx, ny, src] of tufts) {
    for (let k = 0; k < len && free(x + nx * k, y + ny * k); k++)
      fr.set(x + nx * k, y + ny * k, { ...src });
  }
}

const PUFFED = new Set(['torso', 'tail']);

/**
 * The tail, stiff and straight up from the rump at (1, base). 0: normal;
 * 1: a thicker half brush; 2: the full bottle-brush. `flick`: px the tip leans.
 */
function standoffTail(fr, cat, base, puff, flick) {
  const pts = [
    [1, base],
    [1, base - 6],
    [1 + flick, base - 10],
  ];
  if (puff === 0) {
    tail(fr, cat, pts, true);
    return;
  }
  fr.stroke(pts, puff + 1, 'tail', Z.tailFront, { rim: true, tip: 2, tipLabel: 'tailTip' });
}

/**
 * Side-on standoff (facing right): back arched high behind the head, legs
 * stiff on tiptoe, fur on end. `rise`: px the cat stands up on its toes;
 * `hump`: px the mid-back tops the neutral back line; `puff`: 0 a ridge on
 * the spine only / 1 half the tufts / 2 every tuft and the bottle-brush tail;
 * `lean`: px the body shifts forward (+) or back (-); `phase`: tuft shimmer.
 */
function standoff(fr, cat, o) {
  const { rise, hump, puff, lean = 0, flatEars, mouth, flick = 0, phase = 0 } = o;
  const hy = 17 - rise;
  const back = hy - 4;
  const top = back - hump;
  const x = lean;
  // Stiff thin legs from under the head to feet drawn in toward each other.
  for (const [x0, x1, part, z] of [
    [1, 2, 'legB', Z.leg - 0.5],
    [2, 3, 'legB', Z.leg],
    [9, 8, 'legF', Z.leg - 0.5],
    [10, 9, 'legF', Z.leg],
  ]) {
    fr.stroke(
      [
        [x0 + x, hy],
        [x1, 29],
      ],
      2,
      part,
      z,
      { tip: 1, label: z < Z.leg ? 'shade' : 'fur' },
    );
  }
  archTorso(fr, 2 + x, 12 + x, top, 2 * hump + 1, hy + 9);
  standoffTail(fr, cat, back + 2, puff, flick);
  if (puff === 0) {
    const spine = (px, py) => py < top && Math.abs(px - 7 - x) <= 2;
    bristle(fr, PUFFED, { every: 2, len: 1, keep: spine });
  } else bristle(fr, PUFFED, { every: 3, len: puff, phase });
  drawHead(fr, 'right', 2 + x, hy, cat, { eyes: 'wide', mouth, flatEars });
}

const STANDOFF_IN = [
  { rise: 0, hump: 0, puff: 0, flatEars: false },
  { rise: 1, hump: 1, puff: 1, flatEars: true, mouth: 'open' },
  { rise: 2, hump: 3, puff: 2, flatEars: true, mouth: 'open' },
];
const PEAK = STANDOFF_IN[2];

export const SOCIAL_POSES = [
  { name: 'socBoop', draw: (fr, dir, cat) => lean(fr, dir, cat, false) },
  { name: 'socRub', draw: (fr, dir, cat) => lean(fr, dir, cat, true) },
  { name: 'socFlickA', draw: (fr, dir, cat) => flick(fr, dir, cat, 0) },
  { name: 'socFlickB', draw: (fr, dir, cat) => flick(fr, dir, cat, 2) },
  ...STANDOFF_IN.map((o, i) => ({
    name: `socStandoffIn${i + 1}`,
    draw: (fr, _d, cat) => standoff(fr, cat, o),
  })),
  {
    name: 'socStandoffSwayA',
    draw: (fr, _d, cat) => standoff(fr, cat, { ...PEAK, lean: 1, mouth: 'yawn', flick: 1 }),
  },
  {
    name: 'socStandoffSwayB',
    draw: (fr, _d, cat) => standoff(fr, cat, { ...PEAK, lean: -1, flick: -1, phase: 1 }),
  },
];
