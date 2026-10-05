#!/usr/bin/env node
// Generates the cat bed and cat house furniture
// (assets/furniture/<ID>/<ID>.png + manifest.json).
//
//   node scripts/generate-bed-sprites.mjs
//
// The art is hand-authored pixel templates in scripts/beds/ and is MIT like
// the rest of the repo. All items land in the "beds" catalog category.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

import { BEDS, PALETTE } from './beds/bedArt.mjs';
import { HOUSES } from './beds/houseArt.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const furnitureDir = path.join(root, 'webview-ui', 'public', 'assets', 'furniture');
const items = [...BEDS, ...HOUSES];

for (const item of items) {
  const h = item.rows.length;
  const w = item.rows[0].length;
  if (w !== item.fw * 16 || h !== item.fh * 16) {
    throw new Error(`${item.id}: ${w}x${h} does not match footprint ${item.fw}x${item.fh}`);
  }
  const png = new PNG({ width: w, height: h });
  item.rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`${item.id}: row ${y} is ${row.length} px, not ${w}`);
    [...row].forEach((ch, x) => {
      const rgba = PALETTE[ch];
      if (!rgba) throw new Error(`${item.id}: unknown pixel '${ch}' at ${x},${y}`);
      png.data.set(rgba, (y * w + x) * 4);
    });
  });
  const dir = path.join(furnitureDir, item.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${item.id}.png`), PNG.sync.write(png));
  const manifest = {
    id: item.id,
    name: item.name,
    category: 'beds',
    type: 'asset',
    canPlaceOnWalls: false,
    canPlaceOnSurfaces: false,
    backgroundTiles: item.bg,
    width: w,
    height: h,
    footprintW: item.fw,
    footprintH: item.fh,
  };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

console.log(`Wrote ${items.length} beds: ${items.map((t) => t.name).join(', ')}`);
