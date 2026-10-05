// Toy poses: scratching, batting yarn, peeking out of a box, sitting on the
// cat tree, pouncing on a toy mouse, jumping at a feather. Frames 12.. of
// every char_N.png row, after the idle poses. Side poses face right (left is
// mirrored at runtime) and repeat in every row; the box and tree poses face
// the viewer.

import { BOX_ROWS } from '../toys/toyArt.mjs';
import { armAt, drawHead, drawTorso, leg, tail, Z } from './parts.mjs';

const Z_LIFT = Z.head + 1;

function sideTail(fr, cat, pts) {
  tail(fr, cat, pts, false);
}

/** Standing on the hind legs, front paws up on the post. up: paws high. */
function scratch(fr, cat, up) {
  drawHead(fr, 'right', 1, 4, cat);
  drawTorso(fr, 'right', 4, 12);
  fr.stroke(
    [
      [5, 20],
      [5, 29],
    ],
    2,
    'legB',
    Z.leg - 0.5,
    { tip: 1 },
  );
  fr.stroke(
    [
      [8, 20],
      [9, 29],
    ],
    2,
    'legF',
    Z.leg,
    { tip: 1 },
  );
  const paw = up ? [14, 5] : [14, 9];
  armAt(fr, 'armR', [[8, 13], [12, up ? 8 : 11], paw], Z_LIFT);
  sideTail(fr, cat, [
    [4, 19],
    [2, 23],
    [2, 28],
  ]);
}

/** Sitting side-on, one paw raised (wind-up) or swiped down at the yarn. */
function bat(fr, cat, swipe) {
  const fy = 9;
  drawHead(fr, 'right', 2, fy, cat);
  drawTorso(fr, 'right', 5, fy + 8);
  fr.rect(7, 26, 5, 2, 'legF', Z.leg);
  leg(fr, 'legF', 10, 28, 29, 2);
  sideTail(fr, cat, [
    [5, 25],
    [3, 25],
    [2, 23],
    [2, 21],
  ]);
  const pts = swipe
    ? [
        [7, fy + 9],
        [11, fy + 14],
        [14, fy + 17],
      ]
    : [
        [7, fy + 9],
        [10, fy + 5],
        [12, fy + 3],
      ];
  armAt(fr, 'armR', pts, Z_LIFT);
}

/** Head and ears above the box rim, paws on the edge. bob: head 1 px lower. */
function boxPeek(fr, cat, bob) {
  const top = 16; // the box fills the bottom tile of the frame
  fr.stampProp(BOX_ROWS, 0, top, Z.tailBack, (r) => r < 7);
  drawHead(fr, 'down', 2, 12 + (bob ? 1 : 0), cat, { closedEyes: bob });
  fr.stampProp(BOX_ROWS, 0, top, Z_LIFT + 1, (r) => r >= 7);
  fr.stamp(['PP....PP'], 4, top + 6, 'armL', Z_LIFT + 2, { rim: true, dir: 'down' });
}

/** Sitting tall, facing the viewer (top of the cat tree). blink: eyes shut, tail flick. */
function sit(fr, cat, blink) {
  const fy = 10;
  drawHead(fr, 'down', 2, fy, cat, { closedEyes: blink });
  drawTorso(fr, 'down', 4, fy + 8);
  leg(fr, 'legL', 4, 26, 30, 3);
  leg(fr, 'legR', 9, 26, 30, 3);
  tail(
    fr,
    cat,
    blink
      ? [
          [10, 29],
          [12, 29],
          [14, 27],
          [14, 25],
        ]
      : [
          [10, 29],
          [12, 29],
          [13, 27],
          [13, 26],
        ],
    false,
  );
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

/** Low crouch, rear up, then a leap forward with legs stretched out. */
function pounce(fr, cat, leap) {
  if (!leap) {
    drawHead(fr, 'right', 3, 15, cat);
    drawTorso(fr, 'right', 4, 22);
    fr.stroke(
      [
        [9, 29],
        [11, 30],
      ],
      2,
      'legF',
      Z.leg,
      { tip: 1 },
    );
    fr.stroke(
      [
        [4, 28],
        [3, 30],
      ],
      2,
      'legB',
      Z.leg - 0.5,
      { tip: 1 },
    );
    sideTail(fr, cat, [
      [4, 25],
      [2, 22],
      [2, 18],
    ]);
    return;
  }
  drawHead(fr, 'right', 3, 9, cat);
  drawTorso(fr, 'right', 4, 17);
  fr.stroke(
    [
      [9, 23],
      [13, 25],
    ],
    2,
    'legF',
    Z.leg,
    { tip: 1 },
  );
  fr.stroke(
    [
      [5, 24],
      [2, 27],
    ],
    2,
    'legB',
    Z.leg - 0.5,
    { tip: 1 },
  );
  sideTail(fr, cat, [
    [4, 21],
    [2, 21],
    [1, 19],
  ]);
}

/** Crouched under the feather, then up on the hind legs swatting at it. */
function jump(fr, cat, up) {
  if (!up) {
    bat(fr, cat, false);
    return;
  }
  // Airborne: the feet hang 4 px above the floor.
  drawHead(fr, 'right', 1, 3, cat);
  drawTorso(fr, 'right', 4, 11);
  fr.stroke(
    [
      [5, 19],
      [4, 26],
    ],
    2,
    'legB',
    Z.leg - 0.5,
    { tip: 1 },
  );
  fr.stroke(
    [
      [8, 19],
      [9, 26],
    ],
    2,
    'legF',
    Z.leg,
    { tip: 1 },
  );
  armAt(
    fr,
    'armR',
    [
      [8, 12],
      [12, 9],
      [14, 6],
    ],
    Z_LIFT,
  );
  sideTail(fr, cat, [
    [4, 18],
    [2, 22],
    [1, 26],
  ]);
}

/** Frames in sheet order (sheet frames 12..23). Each repeats in every row. */
export const TOY_FRAMES = [
  (fr, cat) => scratch(fr, cat, true),
  (fr, cat) => scratch(fr, cat, false),
  (fr, cat) => bat(fr, cat, false),
  (fr, cat) => bat(fr, cat, true),
  (fr, cat) => boxPeek(fr, cat, false),
  (fr, cat) => boxPeek(fr, cat, true),
  (fr, cat) => sit(fr, cat, false),
  (fr, cat) => sit(fr, cat, true),
  (fr, cat) => pounce(fr, cat, false),
  (fr, cat) => pounce(fr, cat, true),
  (fr, cat) => jump(fr, cat, false),
  (fr, cat) => jump(fr, cat, true),
];
