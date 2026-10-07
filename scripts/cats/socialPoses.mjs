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
 * Halloween-cat arch from (0, y): fur on end along a high round back, the
 * belly tucked up between stiff legs. Row 0 is the spine ridge.
 */
const ARCH = [
  '...F.F.F....',
  '..FhFhFhF...',
  '.FFFFFFFFF..',
  'FFFFFFFFFFF.',
  'FFFFFFFFFFFF',
  'fFFFFFFFFFFF',
  'fFFFF..FFFFF',
  'fFF......FFF',
];
/** The arch before the fur rises: a smooth back (no ridge). */
const ARCH_SMOOTH = ['....FFF.....', ...ARCH.slice(1)];

/**
 * The tail. 0: lifted, normal thickness; 1: half puffed, a jagged edge;
 * 2: the full bottle-brush, tufts sticking out both sides. `flick`: tip px.
 */
function standoffTail(fr, cat, x, y, puff, flick) {
  const pts = [
    [x + 2, y + 3],
    [x + 1, y - 2],
    [x + 1 + flick, y - 7],
  ];
  if (puff === 0) {
    tail(fr, cat, pts, false);
    return;
  }
  const thick = puff + 1;
  fr.stroke(pts, thick, 'tail', Z.tailBack, { tip: 2, tipLabel: 'tailTip' });
  // Tufts alternate left / right: a jagged, bristling outline.
  const step = puff === 1 ? 3 : 2;
  for (let ty = y - 7; ty <= y + 1; ty += step) {
    const left = (ty - y) % (2 * step) === 0;
    const tx = (left ? x : x + 1 + thick) + (ty < y - 4 ? flick : 0);
    fr.set(tx, ty, { label: 'fur', part: 'tail', lx: 0, ly: ty, z: Z.tailBack });
  }
}

/**
 * Side-on standoff (facing right): back arched, legs stiff on tiptoe, feet
 * close together under the arch. `arch`: px the body rises (tiptoe);
 * `puff`: 0 smooth / 1 ridge + half brush / 2 full brush + neck ruff;
 * `lean`: px the body shifts forward (+) or back (-) over planted feet.
 */
function standoff(fr, cat, { arch, puff, lean = 0, flatEars, mouth, flick = 0 }) {
  const y = 10 - arch;
  const x = lean;
  fr.stamp(puff === 0 ? ARCH_SMOOTH : ARCH, x, y, 'torso', Z.torso);
  if (puff === 1) fr.set(x + 5, y, { label: 'fur', part: 'torso', lx: 5, ly: 0, z: Z.torso });
  // Stiff legs from under the arch to feet drawn in toward each other.
  for (const [x0, x1, part, z] of [
    [1, 2, 'legB', Z.leg - 0.5],
    [2, 3, 'legB', Z.leg],
    [9, 8, 'legF', Z.leg - 0.5],
    [10, 9, 'legF', Z.leg],
  ]) {
    fr.stroke(
      [
        [x0 + x, y + 7],
        [x1, 29],
      ],
      2,
      part,
      z,
      { tip: 1, label: z < Z.leg ? 'shade' : 'fur' },
    );
  }
  standoffTail(fr, cat, x, y, puff, flick);
  const hy = y + 7;
  drawHead(fr, 'right', 2 + x, hy, cat, { eyes: 'wide', mouth, flatEars });
  if (puff === 2) {
    // Neck ruff: fur standing out behind the head, over the shoulders.
    for (const [rx, ry] of [
      [1, hy - 1],
      [0, hy + 1],
      [1, hy + 3],
    ])
      fr.set(rx + x, ry, { label: 'fur', part: 'head', lx: 0, ly: ry, z: Z.head, rim: true });
  }
}

const STANDOFF_IN = [
  { arch: 0, puff: 0, flatEars: false },
  { arch: 1, puff: 1, flatEars: true, mouth: 'open' },
  { arch: 3, puff: 2, flatEars: true, mouth: 'open' },
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
    draw: (fr, _d, cat) => standoff(fr, cat, { ...PEAK, lean: -1, flick: -1 }),
  },
];
