// PAINTING_AIVAZOVSKY (48x32, 3x2 wall item): a homage after Aivazovsky's
// "The Ninth Wave", 1850. A huge green wave rears on the left, lit through
// from behind so its body turns translucent green-gold; a sunrise glows over the
// storm; survivors cling to a broken mast on a raft, one waving a red cloth.
// A gilded frame. MIT like the rest of the repo.

import { canvas, gildedFrame, mix, noise } from './canvas.mjs';

const SUN = [255, 248, 210];
const GLOW = [250, 206, 104];
const DAWN = [224, 140, 84];
const CLOUD = [104, 100, 86];
const STORM = [62, 70, 66];
const SEA_LIT = [150, 196, 126]; // translucent green-gold where light passes
const SEA = [58, 112, 92];
const SEA_DEEP = [24, 52, 50];
const FOAM = [242, 240, 222];
const SPRAY = [200, 214, 196];
const WOOD = [62, 40, 28];
const FIGURE = [30, 24, 26];
const CLOTH = [204, 44, 36];

// Canvas x 4..43, y 5..22 (40 x 18). Local coordinates below.
const X0 = 4;
const Y0 = 5;
const W = 40;
const H = 18;
const HORIZON = 8;
const SUN_X = 27;
const SUN_Y = 4;

/** The big wave's top row at local column x, or null where it is no higher than the sea. */
function waveTop(x) {
  if (x > 19) return null;
  return Math.round(1 + Math.abs(x - 8) * (x < 8 ? 0.55 : 0.75));
}

function sky(c) {
  for (let y = 0; y < HORIZON; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.hypot((x - SUN_X) / 1.6, y - SUN_Y);
      let rgb =
        d < 1.2 ? SUN : d < 4 ? mix(SUN, GLOW, (d - 1.2) / 2.8) : mix(GLOW, DAWN, (d - 4) / 6);
      if (d > 10) rgb = mix(DAWN, CLOUD, Math.min(1, (d - 10) / 8));
      // Storm clouds press down from the top corners; soft streaks by noise.
      rgb = mix(rgb, STORM, Math.max(0, (2 - y) / 3) * Math.min(1, d / 12));
      c.set(X0 + x, Y0 + y, mix(rgb, CLOUD, noise(x, y, 11) * 0.18));
    }
}

function sea(c) {
  for (let y = HORIZON; y < H; y++)
    for (let x = 0; x < W; x++) {
      const depth = (y - HORIZON) / (H - HORIZON);
      let rgb = mix(SEA, SEA_DEEP, depth * 0.8 + noise(x, y, 12) * 0.2);
      // The sun's road on the water: a golden column that widens toward us.
      const road = Math.abs(x - SUN_X) - depth * 3;
      if (road < 2) rgb = mix(rgb, GLOW, ((2 - road) / 2) * (0.75 - depth * 0.4));
      // Swell ridges catch the light in short broken streaks.
      if (noise(Math.floor(x / 3), y, 14) > 0.72) rgb = mix(rgb, SEA_LIT, 0.4);
      c.set(X0 + x, Y0 + y, rgb);
    }
}

function wave(c) {
  for (let x = 0; x < W; x++) {
    const top = waveTop(x);
    if (top === null) continue;
    for (let y = top; y < H; y++) {
      const below = y - top;
      // Thin near the crest: light passes through as green-gold, deeper below.
      let rgb = mix(SEA_LIT, SEA, Math.min(1, below / 5));
      rgb = mix(rgb, SEA_DEEP, Math.max(0, (below - 6) / 10));
      c.set(X0 + x, Y0 + y, mix(rgb, SEA_DEEP, noise(x, y, 13) * 0.15));
    }
    // Foam rides the crest; the right face breaks into spray.
    c.set(X0 + x, Y0 + top, FOAM);
    if (x > 8 && x % 2 === 0) c.set(X0 + x, Y0 + top + 1, FOAM);
  }
  // The curl: foam overhangs the crest to the right, spray flies off it.
  c.rect(X0 + 8, Y0, X0 + 12, Y0, FOAM);
  c.rect(X0 + 12, Y0 + 1, X0 + 13, Y0 + 1, FOAM);
  for (const [x, y] of [
    [14, 0],
    [15, 2],
    [13, 3],
    [10, 0],
    [16, 4],
  ])
    c.set(X0 + x, Y0 + y, SPRAY);
}

function raft(c) {
  // A floating spar and a broken mast leaning right, with survivors clinging.
  c.rect(X0 + 19, Y0 + 13, X0 + 27, Y0 + 13, WOOD);
  for (let i = 0; i < 5; i++) c.set(X0 + 22 + i, Y0 + 12 - i, WOOD);
  c.rect(X0 + 25, Y0 + 9, X0 + 28, Y0 + 9, WOOD);
  for (const [x, y] of [
    [20, 12],
    [21, 12],
    [23, 12],
    [24, 11],
    [26, 12],
  ])
    c.set(X0 + x, Y0 + y, FIGURE);
  c.set(X0 + 25, Y0 + 10, FIGURE);
  c.set(X0 + 26, Y0 + 8, CLOTH);
  c.set(X0 + 27, Y0 + 8, CLOTH);
  for (let x = 18; x <= 28; x += 2) c.set(X0 + x, Y0 + 14, FOAM);
}

export function paintingAivazovsky() {
  const c = canvas(48, 32);
  sky(c);
  sea(c);
  wave(c);
  raft(c);
  gildedFrame(c, 1, 2, 46, 25);
  return c;
}
