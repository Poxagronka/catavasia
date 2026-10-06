// Work poses: making coffee at a machine (reach, press, wait, take the cup,
// put it back), walking with the mug, and reading a book from the shelf
// (reach up, pull the book out, read it facing the viewer, flip a page).
// Coffee poses follow the row direction (the machine can be on any side);
// the shelf poses face up (the shelf is on the wall) or down (reading).

import { down, right } from './officePoses.mjs';
import { armAt, drawHead, drawTorso, tail, Z } from './parts.mjs';
import { frontSit } from './restPoses.mjs';
import { sitSide, Z_LIFT } from './sideKit.mjs';

const MUG_FRONT = ['UDDU.', 'UUUUU', 'UUUUU', 'KKKK.'];
const MUG_SIDE = ['.UDU', 'UUUU', 'UUUU', '.KKK'];
const MUG_BACK = ['UU', 'UU', 'KK'];

function mug(fr, rows, x, y, z = Z_LIFT) {
  fr.stamp(rows, x, y, 'mug', z, { rim: true });
}

/** Standing (walk frame `i`) without arms, per row direction. */
function body(fr, dir, cat, i = 1) {
  if (dir === 'right') right(fr, i, cat, { noArms: true });
  else down(fr, i, cat, dir, { noArms: true });
  return i === 1 ? 7 : 6; // head top row of that walk frame
}

/** Arms holding a mug in front of the chest; `low` puts it down at arm's length. */
function holdMug(fr, dir, fy, low = false) {
  const d = low ? 3 : 0;
  if (dir === 'down') {
    mug(fr, MUG_FRONT, 6, fy + 10 + d);
    armAt(
      fr,
      'armL',
      [
        [2, fy + 9],
        [4, fy + 11 + d],
        [6, fy + 11 + d],
      ],
      Z_LIFT,
    );
    armAt(
      fr,
      'armR',
      [
        [12, fy + 9],
        [11, fy + 11 + d],
        [10, fy + 11 + d],
      ],
      Z_LIFT,
    );
  } else if (dir === 'right') {
    mug(fr, MUG_SIDE, 11 + (low ? 1 : 0), fy + 10 + d, Z.arm + 0.5);
    armAt(
      fr,
      'armR',
      [
        [7, fy + 9],
        [9, fy + 11 + d],
        [11 + (low ? 1 : 0), fy + 12 + d],
      ],
      Z.arm,
    );
  } else {
    armAt(
      fr,
      'armL',
      [
        [2, fy + 9],
        [3, fy + 7 + d],
      ],
      Z.arm,
    );
    armAt(
      fr,
      'armR',
      [
        [12, fy + 9],
        [11, fy + 7 + d],
      ],
      Z.arm,
    );
    mug(fr, MUG_BACK, 13, fy + 5 + d);
  }
}

/** One paw out to the machine: `press` pushes 1 px further / lower. */
function reach(fr, dir, cat, press) {
  const p = press ? 1 : 0;
  if (dir === 'right') {
    // The machine stands on a counter at knee height: sit and reach out.
    sitSide(fr, cat, { head: { eyes: 'down' }, paw: false });
    armAt(
      fr,
      'armR',
      [
        [7, 18],
        [11, 22],
        [14 + p, 25 + p],
      ],
      Z_LIFT,
    );
  } else if (dir === 'up') {
    backSit(fr, cat, false);
    // Seen from behind: the raised paw shows past the side of the head.
    armAt(
      fr,
      'armR',
      [
        [13, 18],
        [14, 13],
        [13, 10 + p],
      ],
      Z_LIFT,
    );
  } else {
    frontSit(fr, cat, { head: { eyes: 'down' }, paws: false });
    armAt(
      fr,
      'armL',
      [
        [2, 19],
        [3, 23],
      ],
      Z.arm,
    );
    armAt(
      fr,
      'armR',
      [
        [12, 19],
        [11, 24],
        [10, 27 + p],
      ],
      Z_LIFT,
    );
  }
}

/** Sitting with the back to the viewer; flick: the tail tip lifts. */
function backSit(fr, cat, flick) {
  const fy = 8;
  drawHead(fr, 'up', 2, fy, cat);
  drawTorso(fr, 'up', 4, fy + 8);
  fr.rect(4, fy + 16, 8, 2, 'legL', Z.leg);
  tail(
    fr,
    cat,
    [
      [8, fy + 16],
      [10, fy + 18],
      [12, fy + 18],
      [13 + (flick ? 1 : 0), fy + 15],
    ],
    true,
  );
}

/** Sitting, facing the machine, the tail tip flicking (wait for the brew). */
function wait(fr, dir, cat, flick) {
  if (dir === 'right') {
    sitSide(fr, cat, {
      head: { eyes: flick ? 'happy' : 'right' },
      tailPts: [
        [5, 25],
        [3, 25],
        [2, 23],
        [2 + (flick ? 1 : 0), 20],
      ],
    });
  } else if (dir === 'down') {
    frontSit(fr, cat, {
      head: { eyes: flick ? 'happy' : 'down' },
      tailPts: [
        [10, 29],
        [12, 29],
        [13 + (flick ? 1 : 0), 27],
        [13 + (flick ? 1 : 0), 25],
      ],
    });
  } else {
    backSit(fr, cat, flick);
  }
}

function carry(fr, dir, cat, i) {
  const fy = body(fr, dir, cat, i);
  holdMug(fr, dir, fy);
}

// ── Reading a book from the shelf ───────────────────────────────────────
const BOOK_SPINE = ['BBBB', 'BbbB', 'BBBB'];
const BOOK_COVER = ['BBBBBBBB', 'BBQQQQBB', 'BBBBBBBB', 'BBBQQBBB', 'BBBBBBBB', 'bbbbbbbb'];

/** Back view, up on the toes, both paws up at the shelf; `book`: holding it. */
function shelf(fr, cat, book) {
  const fy = body(fr, 'up', cat) - 1;
  const top = book ? fy - 1 : fy - 2;
  armAt(
    fr,
    'armL',
    [
      [1, fy + 10],
      [1, fy + 4],
      [book ? 4 : 3, top],
    ],
    Z_LIFT,
  );
  armAt(
    fr,
    'armR',
    [
      [14, fy + 10],
      [14, fy + 4],
      [book ? 11 : 12, top],
    ],
    Z_LIFT,
  );
  if (book) fr.stamp(BOOK_SPINE, 6, fy - 2, 'book', Z_LIFT + 1, { rim: true });
}

/** Sitting, facing the viewer behind an open book. */
function read(fr, cat, head, flip = false) {
  const fy = 10;
  frontSit(fr, cat, { fy, head, paws: false });
  fr.stamp(BOOK_COVER, 4, fy + 9, 'book', Z_LIFT, { rim: true });
  armAt(
    fr,
    'armL',
    [
      [2, fy + 9],
      [3, fy + 12],
    ],
    Z_LIFT + 1,
  );
  if (flip)
    armAt(
      fr,
      'armR',
      [
        [12, fy + 9],
        [11, fy + 7],
        [10, fy + 8],
      ],
      Z_LIFT + 1,
    );
  else
    armAt(
      fr,
      'armR',
      [
        [12, fy + 9],
        [11, fy + 12],
      ],
      Z_LIFT + 1,
    );
}

const perDir = (draw) => (fr, dir, cat) => draw(fr, dir, cat);

export const WORK_POSES = [
  { name: 'brewReach', draw: perDir((fr, dir, cat) => reach(fr, dir, cat, false)) },
  { name: 'brewPress', draw: perDir((fr, dir, cat) => reach(fr, dir, cat, true)) },
  { name: 'brewWaitA', draw: perDir((fr, dir, cat) => wait(fr, dir, cat, false)) },
  { name: 'brewWaitB', draw: perDir((fr, dir, cat) => wait(fr, dir, cat, true)) },
  { name: 'brewTake', draw: perDir((fr, dir, cat) => holdMug(fr, dir, body(fr, dir, cat))) },
  { name: 'cupPut', draw: perDir((fr, dir, cat) => holdMug(fr, dir, body(fr, dir, cat), true)) },
  { name: 'carryWalk1', draw: perDir((fr, dir, cat) => carry(fr, dir, cat, 0)) },
  { name: 'carryWalk2', draw: perDir((fr, dir, cat) => carry(fr, dir, cat, 1)) },
  { name: 'carryWalk3', draw: perDir((fr, dir, cat) => carry(fr, dir, cat, 2)) },
  { name: 'readReach', draw: (fr, _d, cat) => shelf(fr, cat, false) },
  { name: 'readPull', draw: (fr, _d, cat) => shelf(fr, cat, true) },
  { name: 'readHold', draw: (fr, _d, cat) => read(fr, cat, { eyes: 'down' }) },
  { name: 'readLookL', draw: (fr, _d, cat) => read(fr, cat, { eyes: 'left' }) },
  { name: 'readLookR', draw: (fr, _d, cat) => read(fr, cat, { eyes: 'right' }) },
  { name: 'readFlip', draw: (fr, _d, cat) => read(fr, cat, { eyes: 'down' }, true) },
  { name: 'readSmile', draw: (fr, _d, cat) => read(fr, cat, { eyes: 'happy' }) },
];
