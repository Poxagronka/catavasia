// Cat tree: climbing up the trunk (back view, paws reaching up in turn),
// a loaf on the top platform with the tail dangling over the edge and
// swaying, a slow blink, and the jump back down (front view, legs out).
// The loaf sits 5 px above the frame bottom: the step dy lowers it so the
// tail hangs over the platform's front.

import { armAt, drawHead, drawTorso, Z } from './parts.mjs';

const LOAF = ['.FFFFFFFFFF.', 'FFFFFFFFFFFF', 'fFFFFFFFFFFf', 'fFPPFFFFPPFf', '.ffffffffff.'];

/** sway: tail tip at -1 / 0 / +1 px. */
function loaf(fr, cat, sway, head = { eyes: 'half' }) {
  fr.stamp(LOAF, 2, 22, 'curl', Z.torso, { dir: 'down' });
  const t = cat.tail === 'thin' ? 1 : 2;
  fr.stroke(
    [
      [12, 24],
      [13, 27],
      [13 + sway, 31],
    ],
    t,
    'tail',
    Z.tailFront,
    { rim: true, tip: 2, tipLabel: 'tailTip', dir: 'down' },
  );
  drawHead(fr, 'down', 2, 15, cat, head);
}

/** Back view, hugging the trunk; alt picks the paw that reaches up. */
function climb(fr, cat, alt) {
  const fy = 6;
  drawHead(fr, 'up', 2, fy, cat);
  drawTorso(fr, 'up', 4, fy + 8);
  armAt(
    fr,
    'armL',
    [
      [3, fy + 9],
      [2, fy + (alt ? 1 : 5)],
    ],
    Z.arm,
  );
  armAt(
    fr,
    'armR',
    [
      [11, fy + 9],
      [12, fy + (alt ? 5 : 1)],
    ],
    Z.arm,
  );
  fr.stroke(
    [
      [5, fy + 16],
      [4, fy + 20 + (alt ? 2 : 0)],
    ],
    2,
    'legL',
    Z.leg,
    { tip: 1 },
  );
  fr.stroke(
    [
      [9, fy + 16],
      [10, fy + 20 + (alt ? 0 : 2)],
    ],
    2,
    'legR',
    Z.leg,
    { tip: 1 },
  );
  fr.stroke(
    [
      [7, fy + 16],
      [7, fy + 21],
      [8, fy + 23],
    ],
    cat.tail === 'thin' ? 1 : 2,
    'tail',
    Z.tailFront,
    { rim: true, tip: 2, tipLabel: 'tailTip' },
  );
}

/** Dropping down to the floor, front view: legs reaching for the ground. */
function drop(fr, cat) {
  drawHead(fr, 'down', 2, 6, cat, { eyes: 'wide' });
  drawTorso(fr, 'down', 4, 14);
  for (const [x0, x1] of [
    [5, 4],
    [9, 10],
  ]) {
    fr.stroke(
      [
        [x0, 21],
        [x1, 27],
      ],
      2,
      'legL',
      Z.leg,
      { tip: 1 },
    );
  }
  armAt(
    fr,
    'armL',
    [
      [2, 15],
      [1, 21],
    ],
    Z.arm,
  );
  armAt(
    fr,
    'armR',
    [
      [12, 15],
      [13, 21],
    ],
    Z.arm,
  );
}

export const TREE_POSES = [
  { name: 'climbA', draw: (fr, _d, cat) => climb(fr, cat, true) },
  { name: 'climbB', draw: (fr, _d, cat) => climb(fr, cat, false) },
  { name: 'treeLoafL', draw: (fr, _d, cat) => loaf(fr, cat, -1) },
  { name: 'treeLoaf', draw: (fr, _d, cat) => loaf(fr, cat, 0) },
  { name: 'treeLoafR', draw: (fr, _d, cat) => loaf(fr, cat, 1) },
  { name: 'treeBlink', draw: (fr, _d, cat) => loaf(fr, cat, 0, { eyes: 'closed' }) },
  { name: 'treeLook', draw: (fr, _d, cat) => loaf(fr, cat, 1, { eyes: 'wide', twitch: true }) },
  { name: 'treeDrop', draw: (fr, _d, cat) => drop(fr, cat) },
];
