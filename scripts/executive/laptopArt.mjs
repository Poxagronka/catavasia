// The executive laptop (16x16, one tile): a thin silver aluminum laptop for
// the Cat CEO desk. Back (the room sees the lid), front and side, with an
// "on" state that lights the screen. MIT like the rest of the repo.

import { canvas } from './canvas.mjs';

// ── Back: the open lid seen from behind ─────────────────────────────────
// A thin upright lid (x 1..13, y 4..12) with square corners and a bright top
// edge, then a 1 px dark hinge gap and a thin base deck that is 1 px wider on
// each side. The aluminum darkens from top to bottom. Column 15 stays clear:
// the desk outline is at x 14.
const LID_BACK = [
  '.SiiiiiiiiiiiS..',
  '.SAAAAAAAAAAAS..',
  '.SuuuuuuuuuuuS..',
  '.SuuuuuuuuuuuS..',
  '.SuuuuuuuuuuuS..',
  '.SaaaaaaaaaaaS..',
  '.SaaaaaaaaaaaS..',
  '.SaaaaaaaaaaaS..',
  '.SSSSSSSSSSSSS..',
  '..nnnnnnnnnnn...',
  'SAAAAAAAAAAAAAS.',
  'nSSSSSSSSSSSSSn.',
];

/** The lid from behind; `on` lights the logo and leaks the screen light. */
export function laptopBack(on) {
  const c = canvas(16, 16);
  c.stamp(0, 4, LID_BACK);
  // A small logo mark in the centre of the lid.
  c.rect(6, 7, 8, 8, on ? 'C' : 'S');
  if (on) {
    // The screen light leaks over the top edge and down the sides.
    c.hline(2, 12, 3, 'x');
    c.vline(0, 4, 8, 'x');
    c.vline(14, 4, 8, 'x');
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
