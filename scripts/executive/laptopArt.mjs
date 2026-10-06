// The executive laptop (16x16, one tile): a thin silver aluminum laptop for
// the Cat CEO desk. Back (the room sees the lid), front and side, with an
// "on" state that lights the screen. MIT like the rest of the repo.

import { canvas } from './canvas.mjs';

// ── Back: the open lid seen from behind ─────────────────────────────────
// The lid stands on the desk top: x 2..13, y 7..13, with a dark hinge line
// at y 14. A small square logo (L) sits in its centre: dim when off,
// backlit when on.
const LID_BACK = [
  '...SSSSSSSSSS...',
  '..SAAAAAAAAAAS..',
  '..SAaaaaaaaaaS..',
  '..SAaaaLLaaaaS..',
  '..SAaaaLLaaaaS..',
  '..SaaaaaaaaaaS..',
  '..SSSSSSSSSSSS..',
  '..nnnnnnnnnnnn..',
  '..ssssssssssss..',
];

/** The lid from behind; `on` adds the screen light that spills past its edges. */
export function laptopBack(on) {
  const c = canvas(16, 16);
  c.stamp(
    0,
    7,
    LID_BACK.map((row) => row.replaceAll('L', on ? 'C' : 'A')),
  );
  // The lid turns a little toward the Cat CEO (left): the screen edge shows there.
  c.vline(2, 8, 13, on ? 'Z' : 'z');
  c.vline(1, 9, 13, 'n');
  c.set(2, 7, 'n');
  // A diagonal sheen on the brushed aluminum.
  c.dots(
    [
      [10, 8],
      [9, 9],
      [11, 8],
    ],
    'A',
  );
  if (on) {
    // The screen light spills over the top edge and fades down the sides.
    c.hline(4, 11, 5, 'x');
    c.hline(3, 12, 6, 'X');
    c.dots(
      [
        [2, 7],
        [13, 7],
      ],
      'X',
    );
    c.set(1, 8, 'X');
    c.set(0, 9, 'x');
    c.set(0, 10, 'x');
    c.set(14, 8, 'x');
  }
  return c.rows();
}

// ── Front: screen and keyboard deck ─────────────────────────────────────
const BODY_FRONT = [
  '...nnnnnnnnnn...',
  '..nzzzzzzzzzzn..',
  '..nzzzzzzzzzzn..',
  '..nzzzzzzzzzzn..',
  '..nzzzzzzzzzzn..',
  '..nzzzzzzzzzzn..',
  '..nzzzzzzzzzzn..',
  '..nnnnnnnnnnnn..',
  '..naSSSSSSSSan..',
  '.naaSSSSSSSSaan.',
  '.nAAAAaaaaAAAAn.',
  '.nnnnnnnnnnnnnn.',
  '..ssssssssssss..',
];

/** Text lines [x0, x1, y] of the three typing frames. */
const SCREEN_TEXT = [
  [
    [4, 8, 5],
    [5, 10, 6],
    [4, 7, 8],
  ],
  [
    [4, 8, 5],
    [5, 10, 6],
    [4, 9, 8],
    [5, 6, 9],
  ],
  [
    [4, 8, 5],
    [5, 10, 6],
    [4, 11, 7],
    [4, 5, 9],
  ],
];

/** Front view; `frame` (0..2) lights the screen with that typing frame. */
export function laptopFront(frame) {
  const c = canvas(16, 16);
  c.stamp(0, 3, BODY_FRONT);
  if (frame === undefined) {
    // Dark glass with a faint reflection.
    c.dots(
      [
        [10, 5],
        [9, 6],
        [11, 5],
      ],
      'n',
    );
  } else {
    c.rect(3, 4, 12, 9, 'Z');
    for (const [x0, x1, y] of SCREEN_TEXT[frame]) c.hline(x0, x1, y, 'c');
  }
  return c.rows();
}

// ── Side: the thin lid tilted back over a slim base ─────────────────────
export function laptopSide() {
  const c = canvas(16, 16);
  // Base slab, x 4..14.
  c.box(4, 12, 14, 14, 'n', 'A');
  c.set(14, 13, 'S');
  // Lid: aluminum back between an outline and the dark screen face.
  c.hline(2, 4, 2, 'n');
  for (let y = 3; y <= 12; y++) {
    const x = 2 + Math.floor((y - 3) / 4);
    c.set(x, y, 'n');
    c.set(x + 1, y, y < 7 ? 'A' : 'a');
    c.set(x + 2, y, 'n');
  }
  c.hline(4, 14, 15, 's');
  return c.rows();
}

export const LAPTOP_MEMBERS = [
  {
    orientation: 'front',
    on: [0, 1, 2].map((f) => laptopFront(f)),
    off: laptopFront(),
  },
  { orientation: 'back', on: [laptopBack(true)], off: laptopBack(false) },
  { orientation: 'side', rows: laptopSide(), mirrorSide: true },
];
