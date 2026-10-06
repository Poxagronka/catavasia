// In-place idle poses: standing still (per row), kneading, the loaf, face
// washing, a yawn, the downward-cat stretch, and the tail chase. Front poses
// face the viewer in every row; side poses face right (left is mirrored).

import { down, right } from './officePoses.mjs';
import { armAt, drawHead, drawTorso, leg, tail, Z } from './parts.mjs';
import { crouch, Z_LIFT } from './sideKit.mjs';

/** Sitting tall, facing the viewer; arms are drawn by the caller unless `paws`. */
export function frontSit(fr, cat, { head = {}, fy = 10, paws = true, tailPts } = {}) {
  drawHead(fr, 'down', 2, fy, cat, head);
  drawTorso(fr, 'down', 4, fy + 8);
  leg(fr, 'legL', 4, 26, 30, 3);
  leg(fr, 'legR', 9, 26, 30, 3);
  tail(
    fr,
    cat,
    tailPts ?? [
      [10, 29],
      [12, 29],
      [13, 27],
      [13, 26],
    ],
    false,
  );
  if (!paws) return;
  armAt(
    fr,
    'armL',
    [
      [2, fy + 9],
      [3, fy + 13],
    ],
    Z.arm,
  );
  armAt(
    fr,
    'armR',
    [
      [12, fy + 9],
      [11, fy + 13],
    ],
    Z.arm,
  );
}

/** Kneading: one front paw pressed down, the other lifted (left or right). */
function knead(fr, cat, left) {
  const fy = 11;
  frontSit(fr, cat, { fy, head: { eyes: 'happy' }, paws: false });
  const lift = (x0, x1, up) => [
    [x0, fy + 9],
    [x1, fy + (up ? 11 : 14)],
  ];
  armAt(fr, 'armL', lift(2, 4, left), Z.arm);
  armAt(fr, 'armR', lift(12, 10, !left), Z.arm);
}

const LOAF = ['.FFFFFFFFFF.', 'FFFFFFFFFFFF', 'fFFFFFFFFFFf', 'fFPPFFFFPPFf', '.ffffffffff.'];

/** A loaf on the floor: paws tucked, tail around the side. */
function loaf(fr, cat, head) {
  fr.stamp(LOAF, 2, 26, 'curl', Z.torso, { dir: 'down' });
  fr.stroke(
    [
      [12, 29],
      [14, 29],
      [14, 27],
    ],
    cat.tail === 'thin' ? 1 : 2,
    'tail',
    Z.tailFront,
    { rim: true, tip: 2, tipLabel: 'tailTip', dir: 'down' },
  );
  drawHead(fr, 'down', 2, 19, cat, head);
}

/** Face washing: the right paw at the mouth (lick) or over the eye and ear (wipe). */
function groom(fr, cat, mode) {
  const fy = 10;
  const head =
    mode === 'lick'
      ? { eyes: 'closed', mouth: 'tongue' }
      : mode === 'lick2'
        ? { eyes: 'closed' }
        : { eyes: 'closed' };
  frontSit(fr, cat, { fy, head, paws: false });
  armAt(
    fr,
    'armL',
    [
      [2, fy + 9],
      [3, fy + 13],
    ],
    Z.arm,
  );
  const paw = {
    lick: [7, fy + 7],
    lick2: [8, fy + 6],
    wipe: [9, fy + 3],
    ear: [10, fy - 1],
  }[mode];
  armAt(fr, 'armR', [[12, fy + 9], [11, fy + 7], paw], Z_LIFT);
}

/** Downward cat: chest low, front paws far forward, rear up, tail high. */
function stretchFront(fr, cat) {
  crouch(fr, cat, {
    hy: 21,
    rear: 4,
    head: { eyes: 'closed', mouth: 'yawn' },
    flick: 2,
    paws: false,
  });
  fr.rect(12, 30, 4, 1, 'legF', Z.leg + 0.2, 'paw');
  fr.rect(11, 29, 3, 1, 'legF', Z.leg + 0.2);
}

/** Back stretch: standing, one hind leg pushed straight back. */
function stretchBack(fr, cat) {
  right(fr, 1, cat);
  fr.stroke(
    [
      [5, 23],
      [1, 27],
      [0, 28],
    ],
    2,
    'legB',
    Z.leg - 0.4,
    { tip: 1, label: 'shade' },
  );
}

/** Tail chase: crouched, the tail curled forward over the back toward the nose. */
function chase(fr, cat, near) {
  crouch(fr, cat, { hy: 19, rear: 2, head: { eyes: 'wide', mouth: 'open' } });
  fr.stroke(
    [[1, 22], [2, 17], near ? [6, 15] : [4, 14]],
    cat.tail === 'thin' ? 1 : 2,
    'tail',
    Z.head + 1,
    { rim: true, tip: 2, tipLabel: 'tailTip' },
  );
}

export const REST_POSES = [
  {
    name: 'stand',
    draw: (fr, dir, cat) => (dir === 'right' ? right(fr, 1, cat) : down(fr, 1, cat, dir)),
  },
  { name: 'kneadA', draw: (fr, _d, cat) => knead(fr, cat, true) },
  { name: 'kneadB', draw: (fr, _d, cat) => knead(fr, cat, false) },
  { name: 'loaf', draw: (fr, _d, cat) => loaf(fr, cat, {}) },
  { name: 'loafHalf', draw: (fr, _d, cat) => loaf(fr, cat, { eyes: 'half' }) },
  { name: 'loafBlink', draw: (fr, _d, cat) => loaf(fr, cat, { eyes: 'closed' }) },
  { name: 'loafTwitch', draw: (fr, _d, cat) => loaf(fr, cat, { eyes: 'half', twitch: true }) },
  { name: 'sitFront', draw: (fr, _d, cat) => frontSit(fr, cat) },
  { name: 'sitHappy', draw: (fr, _d, cat) => frontSit(fr, cat, { head: { eyes: 'happy' } }) },
  {
    name: 'sitDizzy',
    draw: (fr, _d, cat) => frontSit(fr, cat, { head: { eyes: 'half', mouth: 'open' } }),
  },
  { name: 'groomLick', draw: (fr, _d, cat) => groom(fr, cat, 'lick') },
  { name: 'groomLick2', draw: (fr, _d, cat) => groom(fr, cat, 'lick2') },
  { name: 'groomWipe', draw: (fr, _d, cat) => groom(fr, cat, 'wipe') },
  { name: 'groomEar', draw: (fr, _d, cat) => groom(fr, cat, 'ear') },
  {
    name: 'yawnOpen',
    draw: (fr, _d, cat) => frontSit(fr, cat, { head: { eyes: 'half', mouth: 'open' } }),
  },
  {
    name: 'yawnBig',
    draw: (fr, _d, cat) => frontSit(fr, cat, { fy: 9, head: { eyes: 'closed', mouth: 'yawn' } }),
  },
  {
    name: 'yawnSmack',
    draw: (fr, _d, cat) => frontSit(fr, cat, { head: { eyes: 'happy', mouth: 'tongue' } }),
  },
  { name: 'stretchFront', draw: (fr, _d, cat) => stretchFront(fr, cat) },
  { name: 'stretchBack', draw: (fr, _d, cat) => stretchBack(fr, cat) },
  { name: 'chaseA', draw: (fr, _d, cat) => chase(fr, cat, false) },
  { name: 'chaseB', draw: (fr, _d, cat) => chase(fr, cat, true) },
];
