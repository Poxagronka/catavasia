#!/usr/bin/env node
// Generates the cat character sprites (char_N.png) and the README strip.
//
//   node scripts/generate-cat-sprites.mjs
//
// Output contract per char_N.png: 3 direction rows (down, up, right) of
// 16x32 frames. Frames 0-6 are walk1 walk2 walk3 type1 type2 read1 read2
// (the original 112x96 sheet); frames 7.. are idle-activity poses (see
// scripts/cats/idlePoses.mjs). Loaders read any width >= 7 frames.
// The art is hand-authored pixel templates in scripts/cats/ and is MIT like
// the rest of the repo.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

import { BREEDS, colorize } from './cats/breeds.mjs';
import { FRAME_H, FRAME_W } from './cats/canvas.mjs';
import { renderCatFrames } from './cats/poses.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'webview-ui', 'public');
const charDir = path.join(publicDir, 'assets', 'characters');
const DIRS = ['down', 'up', 'right'];

function writePng(file, w, h, paint) {
  const png = new PNG({ width: w, height: h });
  paint((x, y, [r, g, b, a]) => {
    const i = (y * w + x) * 4;
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = a;
  });
  fs.writeFileSync(file, PNG.sync.write(png));
}

const sheets = BREEDS.map((breed) => ({ breed, frames: renderCatFrames(breed) }));

for (const old of fs.readdirSync(charDir)) {
  if (/^char_\d+\.png$/i.test(old)) fs.unlinkSync(path.join(charDir, old));
}

sheets.forEach(({ breed, frames }, n) => {
  writePng(path.join(charDir, `char_${n}.png`), FRAME_W * frames[0].length, FRAME_H * 3, (put) => {
    frames.forEach((row, d) =>
      row.forEach((grid, f) =>
        grid.forEach((line, y) =>
          line.forEach((cell, x) =>
            put(f * FRAME_W + x, d * FRAME_H + y, colorize(breed, cell, DIRS[d])),
          ),
        ),
      ),
    );
  });
});

// README strip: every cat's idle front frame, 4x, on a transparent background.
const SCALE = 4;
const CELL_W = 20 * SCALE;
writePng(path.join(publicDir, 'cats.png'), CELL_W * sheets.length, 36 * SCALE, (put) => {
  sheets.forEach(({ breed, frames }, n) => {
    const grid = frames[0][1];
    for (let y = 0; y < 36 * SCALE; y++)
      for (let x = 0; x < CELL_W; x++) {
        const fx = Math.floor((x - 2 * SCALE) / SCALE);
        const fy = Math.floor((y - 2 * SCALE) / SCALE);
        const cell = fx >= 0 && fx < FRAME_W && fy >= 0 && fy < FRAME_H ? grid[fy][fx] : null;
        put(n * CELL_W + x, y, colorize(breed, cell, 'down'));
      }
  });
});

console.log(
  `Wrote ${sheets.length} cats: ${BREEDS.map((b) => `${b.name} (${b.breed})`).join(', ')}`,
);
