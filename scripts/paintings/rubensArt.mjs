// PAINTING_RUBENS (32x32, 2x2 wall item): a homage after Rubens's "The Descent
// from the Cross", 1612-14, Antwerp Cathedral. The pale body slides down a white
// shroud that runs on a diagonal from the top of the cross to the lower left;
// John in a red cloak takes its weight, the Magdalene with golden hair kneels at
// the feet, workmen lean from the crossbeam, all against a dark baroque ground.
// An ornate gilded frame. MIT like the rest of the repo.

import { canvas, gildedFrame, mix, noise } from './canvas.mjs';

const COLORS = {
  K: [46, 34, 28], // workmen in shadow
  f: [214, 160, 116], // warm flesh
  F: [168, 112, 78], // flesh shade
  P: [222, 202, 168], // the pale body
  p: [158, 136, 110], // body shade
  h: [58, 40, 30], // hair
  S: [252, 252, 246], // shroud
  s: [168, 174, 182], // shroud fold
  R: [194, 36, 30], // John's red cloak
  r: [128, 22, 22], // cloak shade
  B: [52, 66, 112], // the Virgin's blue
  G: [92, 112, 58], // the Magdalene's green
  Y: [226, 176, 76], // golden hair
  X: [84, 58, 36], // cross wood
};
const GROUND_TOP = [56, 44, 32];
const GROUND_LOW = [22, 16, 14];

// 18 x 19, canvas-local. The shroud diagonal goes from the upper right to the
// lower left; the body follows it, its arm still held from the crossbeam.
const SCENE = [
  '.KfK......X..KfK..',
  'KKKKKXXXXXXXKKKKK.',
  '.KKK......X.KfKK..',
  '.KK.......XSSKK...',
  '..........SSfP....',
  '.........SSPp.....',
  '........SShhP.....',
  '.......SShPPPp....',
  '..ff..SSPPPPPp....',
  '.BffRSSPPPPPPp....',
  'BBBRRRSPPPPPPp....',
  'BBRRRRRrPPPPp.....',
  'BBRRRRrSPPPPPp....',
  '.RRRRrSSspPPPPp...',
  '.RRRrSSs...pPPPYY.',
  'RRRrSSs.....pPfYY.',
  'RRrSSs.....GGGGGY.',
  'RrSSs.....GGGGGGG.',
  'rSSs.....GGGGGGGG.',
];

export function paintingRubens() {
  const c = canvas(32, 32);
  // Canvas x 7..24, y 4..22: a dark ground that glows faintly behind the body.
  for (let y = 4; y <= 22; y++)
    for (let x = 7; x <= 24; x++) {
      const base = mix(GROUND_TOP, GROUND_LOW, (y - 4) / 18);
      c.set(x, y, mix(base, GROUND_LOW, noise(x, y, 7) * 0.4));
    }
  c.stamp(7, 4, SCENE, COLORS);
  gildedFrame(c, 4, 1, 27, 25);
  return c;
}
