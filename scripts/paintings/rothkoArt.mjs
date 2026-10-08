// PAINTING_ROTHKO (32x32, 2x2 wall item): a color-field homage after Rothko's
// "No. 61 (Rust and Blue)", 1953. A portrait canvas of a blue-black ground with
// a deep rust block over a blue block; the blocks breathe into the ground
// through feathered edges. A thin dark frame, like a modern stretcher strip.
// MIT like the rest of the repo.

import { canvas, frame, mix, noise } from './canvas.mjs';

const FRAME = [36, 32, 34];
const FRAME_LIT = [64, 58, 60];
const GROUND = [22, 26, 46];
const GROUND_GLOW = [40, 36, 62];
const RUST = [148, 58, 34];
const RUST_DEEP = [112, 40, 30];
const RUST_GLOW = [178, 84, 46];
const BLUE = [44, 66, 116];
const BLUE_DEEP = [30, 44, 86];
const SEAM = [30, 24, 40];

/**
 * A soft-edged block: the outer ring mixes half into the ground, the corners
 * more, and a faint scumble (noise) keeps the paint alive.
 */
function block(c, x0, y0, x1, y1, color, deep, seed) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const edgeX = x === x0 || x === x1;
      const edgeY = y === y0 || y === y1;
      // Darker toward the bottom: the blocks sit heavy, as on the canvas.
      let rgb = mix(color, deep, ((y - y0) / Math.max(1, y1 - y0)) * 0.6);
      rgb = mix(rgb, deep, noise(x, y, seed) * 0.35);
      const feather = edgeX && edgeY ? 0.7 : edgeX || edgeY ? 0.45 : 0;
      c.set(x, y, feather ? mix(rgb, c.get(x, y), feather) : rgb);
    }
  }
}

export function paintingRothko() {
  const c = canvas(32, 32);
  // Canvas x 6..25, y 2..24 inside a 1 px frame.
  for (let y = 2; y <= 24; y++)
    for (let x = 6; x <= 25; x++) c.set(x, y, mix(GROUND, GROUND_GLOW, noise(x, y, 1) * 0.5));
  // The rust block fills the upper half; a glow lifts its top.
  block(c, 8, 4, 23, 13, RUST, RUST_DEEP, 2);
  for (let x = 10; x <= 21; x++) c.blend(x, 5, RUST_GLOW, 0.5 + noise(x, 5, 3) * 0.3);
  // A dark seam of ground between the blocks, then the blue block below.
  for (let x = 8; x <= 23; x++) c.blend(x, 14, SEAM, 0.6);
  block(c, 8, 16, 23, 22, BLUE, BLUE_DEEP, 4);
  frame(c, 5, 1, 26, 25, [[FRAME_LIT, FRAME]]);
  return c;
}
