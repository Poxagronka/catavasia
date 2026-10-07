// PAINTING_MOEBIUS (32x32, 2x2 wall item): a homage after Moebius's "Arzach",
// 1975. A lone rider on a long-beaked white bird glides over a pale desert:
// flat pastel sky bands, lilac mesas, clean ink outlines (ligne claire). The
// composition and palette are inspired by the comic; the rider is our own.
// A clean light frame, like a print in a white gallery mount.
// MIT like the rest of the repo.

import { canvas, frame } from './canvas.mjs';

const INK = [52, 44, 66];
const COLORS = {
  o: INK,
  W: [252, 250, 244], // bird white
  w: [206, 210, 222], // bird shade
  b: [226, 158, 76], // beak
  h: [92, 84, 110], // rider helmet
  f: [236, 184, 150], // rider face
  r: [196, 70, 56], // rider cloak
  R: [146, 46, 44], // cloak shade
  s: [200, 168, 132], // bird shadow on the sand
};
const SKY = [
  [246, 206, 182], // peach top
  [250, 222, 190],
  [252, 236, 200], // pale yellow toward the horizon
];
const MESA = [196, 166, 196];
const MESA_SHADE = [168, 138, 176];
const SAND = [238, 214, 168];
const SAND_DUNE = [222, 192, 146];
const FRAME_LIT = [246, 244, 238];
const FRAME_SHADE = [206, 202, 194];
const FRAME_LINE = [150, 144, 140];

// The bird flies left: a long beak, an eye, a neck reaching forward, one wing
// raised high and one hanging below, the tail to the right. The rider sits
// upright on its back in a pointed helmet and a red cloak.
const BIRD = [
  '..................o.....',
  '...........h.....oWo....',
  '..........hhh...oWWo....',
  '..........hfh..oWWwo....',
  '....ooo...rRr.oWWwo.....',
  'ooooWWWo..rRroWWwo......',
  'obbbWWoWo.oRoWWWo.......',
  '.ooooWWWWWWWWWWWWWWWoo..',
  '.....ooWWWWWWWWWWWWWWWo.',
  '.......ooWWWwwwwWWWWWWWo',
  '.........oowwwwoooooooo.',
  '...........owwwo........',
  '............ooo.........',
];

export function paintingMoebius() {
  const c = canvas(32, 32);
  // Canvas x 3..28, y 7..23. Flat sky bands, no gradient: ligne claire.
  const bands = [7, 11, 15];
  for (let y = 7; y <= 20; y++) {
    const band = bands.filter((b) => y >= b).length - 1;
    c.rect(3, y, 28, y, SKY[band]);
  }
  // Lilac mesas on the horizon, flat tops, outlined in ink.
  c.rect(3, 18, 7, 20, MESA);
  c.rect(4, 17, 6, 17, MESA);
  c.rect(22, 17, 28, 20, MESA);
  c.rect(24, 16, 27, 16, MESA);
  c.rect(27, 17, 28, 20, MESA_SHADE);
  for (const [x, y] of [
    [4, 16],
    [5, 16],
    [6, 16],
    [3, 17],
    [7, 17],
    [8, 18],
    [24, 15],
    [25, 15],
    [26, 15],
    [27, 15],
    [23, 16],
    [28, 16],
    [22, 16],
    [21, 17],
  ])
    c.set(x, y, INK);
  // The desert floor and a soft dune line.
  c.rect(3, 21, 28, 23, SAND);
  c.rect(3, 21, 28, 21, INK);
  for (let x = 3; x <= 28; x++) c.set(x, 23 - (x % 9 < 4 ? 0 : 1), SAND_DUNE);
  // The bird's shadow on the sand, then the bird and its rider.
  c.rect(10, 22, 20, 22, COLORS.s);
  c.stamp(4, 7, BIRD, COLORS);
  frame(c, 1, 5, 30, 25, [
    [FRAME_LIT, FRAME_SHADE],
    [FRAME_LINE, FRAME_LINE],
  ]);
  return c;
}
