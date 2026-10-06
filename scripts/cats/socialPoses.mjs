// Social poses drawn as activity frames: a nose boop, a head rub, the
// arched-back hiss before a fight, and a happy tail flick while listening.
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
    sitSide(fr, cat, {
      head: { eyes: 'happy' },
      tailPts: [
        [5, 25],
        [2, 23],
        [1, 18],
        [2 + f, 15],
      ],
    });
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

const ARCH = ['...FFFFF...', '.FFhhhhhFF.', 'FFFFFFFFFFF', 'fFFFFFFFFFf', 'ff.......ff'];

/** Arched back, fur on end, hissing; `up`: the body bobs 1 px higher. */
function hiss(fr, cat, up) {
  const y = 15 - up;
  fr.stamp(ARCH, 0, y, 'torso', Z.torso);
  for (const [x, z] of [
    [0, Z.leg - 0.5],
    [3, Z.leg],
    [8, Z.leg - 0.5],
    [9, Z.leg],
  ]) {
    fr.rect(x, y + 4, 2, 30 - (y + 4), x < 5 ? 'legB' : 'legF', z);
    fr.rect(x, 30, 2, 1, x < 5 ? 'legB' : 'legF', z, 'paw');
  }
  // A bottle-brush tail straight up.
  fr.stroke(
    [
      [1, y + 1],
      [0, y - 6],
      [1, y - 10],
    ],
    3,
    'tail',
    Z.tailBack,
    { tip: 2, tipLabel: 'tailTip' },
  );
  drawHead(fr, 'right', 4, y + 2, cat, { eyes: 'wide', mouth: 'yawn' });
}

export const SOCIAL_POSES = [
  { name: 'socBoop', draw: (fr, dir, cat) => lean(fr, dir, cat, false) },
  { name: 'socRub', draw: (fr, dir, cat) => lean(fr, dir, cat, true) },
  { name: 'socFlickA', draw: (fr, dir, cat) => flick(fr, dir, cat, 0) },
  { name: 'socFlickB', draw: (fr, dir, cat) => flick(fr, dir, cat, 2) },
  { name: 'socHissA', draw: (fr, _d, cat) => hiss(fr, cat, 0) },
  { name: 'socHissB', draw: (fr, _d, cat) => hiss(fr, cat, 1) },
];
