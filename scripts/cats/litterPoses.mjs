// Litter box poses (side poses face right; left is mirrored at runtime):
// a sniff at the sand, digging with one front paw, the squat with the tail
// up (focused, strained, caught being watched), a proud sit after. Front
// poses: the grimace at an overflowing box, recoiling, and a sheepish look
// away after an accident on the floor.

import { frontSit } from './restPoses.mjs';
import { crouch, farLimb, nearArm, sitSide } from './sideKit.mjs';

/** Low over the sand: the far paw planted, the near paw at (x, y). */
function dig(fr, cat, x, y, head) {
  crouch(fr, cat, { hy: 20, rear: 1, head, paws: false });
  farLimb(fr, [
    [11, 26],
    [12, 30],
  ]);
  nearArm(
    fr,
    [
      [9, 25],
      [Math.round((9 + x) / 2), Math.min(y, 27)],
      [x, y],
    ],
    true,
  );
}

const squat =
  (head, headDy = 0) =>
  (fr, _d, cat) =>
    sitSide(fr, cat, { head, headDy, tail: 'up' });

export const LITTER_POSES = [
  // Nose down to the sand: is this a good spot?
  {
    name: 'litSniff',
    draw: (fr, _d, cat) => crouch(fr, cat, { hy: 21, head: { eyes: 'down' } }),
  },
  // The paw reaches out and scrapes back: dig, dig, dig.
  { name: 'litDigA', draw: (fr, _d, cat) => dig(fr, cat, 14, 29, { eyes: 'down' }) },
  { name: 'litDigB', draw: (fr, _d, cat) => dig(fr, cat, 8, 30, { eyes: 'half' }) },
  // The squat: tail straight up, eyes half shut in focus...
  { name: 'litSquat', draw: squat({ eyes: 'half' }) },
  // ...a big effort...
  { name: 'litStrain', draw: squat({ eyes: 'closed' }, 1) },
  // ...and wide eyes, ears flat: someone is watching!
  { name: 'litShy', draw: squat({ eyes: 'wide', flatEars: true }) },
  // Done: chin up, tail flicking, very pleased.
  {
    name: 'litProud',
    draw: (fr, _d, cat) => sitSide(fr, cat, { head: { eyes: 'happy' }, headDy: -1, tail: 'flick' }),
  },
  // An overflowing box: eyes squeezed, tongue out, ears back. Bleh.
  {
    name: 'litGrimace',
    draw: (fr, _d, cat) =>
      frontSit(fr, cat, { head: { eyes: 'closed', mouth: 'tongue', flatEars: true } }),
  },
  // Recoiling from the smell: up tall, eyes wide, mouth open.
  {
    name: 'litRecoil',
    draw: (fr, _d, cat) =>
      frontSit(fr, cat, { fy: 9, head: { eyes: 'wide', mouth: 'o', flatEars: true } }),
  },
  // After an accident on the floor: looking away, ears down. Not me.
  {
    name: 'litSheepish',
    draw: (fr, _d, cat) => frontSit(fr, cat, { head: { eyes: 'left', flatEars: true } }),
  },
];
