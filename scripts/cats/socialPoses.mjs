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
 * belly tucked up between stiff legs.
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

/** The bottle-brush tail: a thick column with tufts sticking out both sides. */
function brushTail(fr, y) {
  const pts = [
    [1, y + 3],
    [0, y - 2],
    [1, y - 7],
  ];
  fr.stroke(pts, 3, 'tail', Z.tailBack, { tip: 2, tipLabel: 'tailTip' });
  for (let ty = y - 6; ty <= y + 2; ty += 3) {
    fr.set(ty % 2 ? -1 : 3, ty, { label: 'fur', part: 'tail', lx: 0, ly: ty, z: Z.tailBack });
    fr.set(3, ty + 1, { label: 'fur', part: 'tail', lx: 0, ly: ty + 1, z: Z.tailBack });
  }
}

/**
 * Arched back, fur on end, ears flat, mouth wide open, hissing. `up`: the
 * body bobs 1 px higher and the "hss" lines in front of the mouth shake.
 */
function hiss(fr, cat, up) {
  const y = 8 - up;
  fr.stamp(ARCH, 0, y, 'torso', Z.torso);
  // Stiff legs, splayed a little: far ones in the shade colour.
  for (const [x0, x1, part, z] of [
    [1, 0, 'legB', Z.leg - 0.5],
    [2, 3, 'legB', Z.leg],
    [9, 10, 'legF', Z.leg - 0.5],
    [11, 12, 'legF', Z.leg],
  ]) {
    fr.stroke(
      [
        [x0, y + 7],
        [x1, 29],
      ],
      2,
      part,
      z,
      { tip: 1, label: z < Z.leg ? 'shade' : 'fur' },
    );
  }
  brushTail(fr, y);
  // The head is held forward at shoulder height, below the top of the arch.
  const hy = y + 7;
  drawHead(fr, 'right', 2, hy, cat, { eyes: 'wide', mouth: 'yawn', flatEars: true });
  // "hss": a short zigzag of breath in front of the open mouth. The head
  // sits 2 px back from the frame edge, so two cats face to face keep a gap.
  const dx = up ? 1 : 0;
  for (const [x, yy] of [
    [14 + dx, hy + 4],
    [15 - dx, hy + 5],
    [14 + dx, hy + 6],
    [15 - dx, hy + 7],
  ])
    fr.addOverlay(x, yy, 'whisker');
}

export const SOCIAL_POSES = [
  { name: 'socBoop', draw: (fr, dir, cat) => lean(fr, dir, cat, false) },
  { name: 'socRub', draw: (fr, dir, cat) => lean(fr, dir, cat, true) },
  { name: 'socFlickA', draw: (fr, dir, cat) => flick(fr, dir, cat, 0) },
  { name: 'socFlickB', draw: (fr, dir, cat) => flick(fr, dir, cat, 2) },
  { name: 'socHissA', draw: (fr, _d, cat) => hiss(fr, cat, 0) },
  { name: 'socHissB', draw: (fr, _d, cat) => hiss(fr, cat, 1) },
];
