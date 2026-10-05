#!/usr/bin/env node
// Generates the cat toy furniture (assets/furniture/<ID>/<ID>.png + manifest.json).
//
//   node scripts/generate-toy-sprites.mjs
//
// The art is hand-authored pixel templates in scripts/toys/toyArt.mjs and is
// MIT like the rest of the repo. Toys land in the "toys" catalog category.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

import { PALETTE, TOYS } from './toys/toyArt.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const furnitureDir = path.join(root, 'webview-ui', 'public', 'assets', 'furniture');

for (const toy of TOYS) {
  const h = toy.rows.length;
  const w = toy.rows[0].length;
  if (w !== toy.fw * 16 || h !== toy.fh * 16) {
    throw new Error(`${toy.id}: ${w}x${h} does not match footprint ${toy.fw}x${toy.fh}`);
  }
  const png = new PNG({ width: w, height: h });
  toy.rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`${toy.id}: row ${y} is ${row.length} px, not ${w}`);
    [...row].forEach((ch, x) => {
      const rgba = PALETTE[ch];
      if (!rgba) throw new Error(`${toy.id}: unknown pixel '${ch}' at ${x},${y}`);
      png.data.set(rgba, (y * w + x) * 4);
    });
  });
  const dir = path.join(furnitureDir, toy.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${toy.id}.png`), PNG.sync.write(png));
  const manifest = {
    id: toy.id,
    name: toy.name,
    category: 'toys',
    type: 'asset',
    canPlaceOnWalls: false,
    canPlaceOnSurfaces: false,
    backgroundTiles: toy.bg,
    width: w,
    height: h,
    footprintW: toy.fw,
    footprintH: toy.fh,
  };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

console.log(`Wrote ${TOYS.length} toys: ${TOYS.map((t) => t.name).join(', ')}`);
