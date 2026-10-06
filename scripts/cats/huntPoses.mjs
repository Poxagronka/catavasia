// Floor toys hunted from a crouch (facing right; left is mirrored):
// the ball of yarn (frame x 15+, y 20-31) is batted with one paw; the toy
// mouse (frame x 14+, y 22-29) is stalked, pounced on and pinned.

import { drawHead, drawTorso, Z } from './parts.mjs';
import { crouch, farLimb, nearArm, sitSide, Z_LIFT } from './sideKit.mjs';

/** The near front paw reaching out from a crouch, to (x, y). */
function crouchPaw(fr, cat, x, y, opts = {}) {
  crouch(fr, cat, { ...opts, paws: false });
  farLimb(fr, [
    [11, 26],
    [12, 30],
  ]);
  nearArm(
    fr,
    [
      [9, 25],
      [11, Math.min(y, 26)],
      [x, y],
    ],
    true,
  );
}

/** Mid-air, body stretched toward the mouse: paws forward, hind legs back. */
function leap(fr, cat) {
  drawHead(fr, 'right', 4, 12, cat, { eyes: 'wide', mouth: 'open' });
  drawTorso(fr, 'right', 4, 19);
  fr.stroke(
    [
      [9, 24],
      [14, 26],
    ],
    2,
    'legF',
    Z_LIFT,
    { tip: 2, rim: true },
  );
  fr.stroke(
    [
      [5, 25],
      [1, 28],
    ],
    2,
    'legB',
    Z.leg - 0.5,
    { tip: 1 },
  );
  fr.stroke(
    [
      [4, 22],
      [1, 20],
      [0, 17],
    ],
    cat.tail === 'thin' ? 1 : 2,
    'tail',
    Z.tailBack,
    { tip: 2, tipLabel: 'tailTip' },
  );
}

/** Landed on the mouse: both front paws pinned on it, rear up, head down looking at it. */
function pin(fr, cat, happy) {
  crouch(fr, cat, {
    hy: 18,
    rear: 2,
    flick: happy ? 2 : 0,
    head: happy ? { eyes: 'happy' } : { eyes: 'down' },
    paws: false,
  });
  farLimb(fr, [
    [11, 26],
    [14, 29],
  ]);
  nearArm(
    fr,
    [
      [9, 26],
      [12, 28],
      [15, 29],
    ],
    true,
  );
}

export const HUNT_POSES = [
  // Ball of yarn.
  { name: 'yarnStalk', draw: (fr, _d, cat) => crouch(fr, cat) },
  { name: 'yarnWiggleA', draw: (fr, _d, cat) => crouch(fr, cat, { rear: 2, flick: 2 }) },
  { name: 'yarnWiggleB', draw: (fr, _d, cat) => crouch(fr, cat, { rear: 1, flick: -1 }) },
  // Paw raised high, then the swipe down onto the ball.
  {
    name: 'yarnWindup',
    draw: (fr, _d, cat) => crouchPaw(fr, cat, 12, 18, { hy: 16, rear: 1 }),
  },
  {
    name: 'yarnBat',
    draw: (fr, _d, cat) =>
      crouchPaw(fr, cat, 15, 25, { hy: 17, head: { eyes: 'wide', mouth: 'open' } }),
  },
  // Sitting up proud, pleased with itself.
  {
    name: 'yarnProud',
    draw: (fr, _d, cat) =>
      sitSide(fr, cat, {
        head: { eyes: 'happy' },
        tailPts: [
          [5, 25],
          [3, 24],
          [2, 21],
          [3, 18],
        ],
      }),
  },
  // Toy mouse.
  {
    name: 'mouseStalk',
    draw: (fr, _d, cat) => crouch(fr, cat, { hy: 18, head: { eyes: 'wide' } }),
  },
  { name: 'mouseWiggleA', draw: (fr, _d, cat) => crouch(fr, cat, { hy: 18, rear: 2, flick: 2 }) },
  { name: 'mouseWiggleB', draw: (fr, _d, cat) => crouch(fr, cat, { hy: 18, rear: 0, flick: -1 }) },
  { name: 'mouseLeap', draw: (fr, _d, cat) => leap(fr, cat) },
  { name: 'mousePin', draw: (fr, _d, cat) => pin(fr, cat, false) },
  { name: 'mouseGotIt', draw: (fr, _d, cat) => pin(fr, cat, true) },
];
