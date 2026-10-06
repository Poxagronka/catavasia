#!/usr/bin/env node
// Generates the coffee corner furniture (assets/furniture/<ID>/ + manifest.json).
//
//   node scripts/generate-coffee-sprites.mjs
//
// The art is hand-authored pixel templates in scripts/coffee/coffeeArt.mjs
// and is MIT like the rest of the repo. Items land in the "coffee" catalog
// category. A brewer is an animation group: frame 0 is the placed item, the
// other frames are its brewing look (see coffeeArt.mjs), chosen by the cats.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

import { COFFEE_ITEMS, PALETTE } from './coffee/coffeeArt.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const furnitureDir = path.join(root, 'webview-ui', 'public', 'assets', 'furniture');
const SIZE = 16;

function writeFrame(file, rows, id) {
  const png = new PNG({ width: SIZE, height: SIZE });
  if (rows.length !== SIZE) throw new Error(`${id}: ${rows.length} rows, not ${SIZE}`);
  rows.forEach((row, y) => {
    if (row.length !== SIZE) throw new Error(`${id}: row ${y} is ${row.length} px, not ${SIZE}`);
    [...row].forEach((ch, x) => {
      const rgba = PALETTE[ch];
      if (!rgba) throw new Error(`${id}: unknown pixel '${ch}' at ${x},${y}`);
      png.data.set(rgba, (y * SIZE + x) * 4);
    });
  });
  fs.writeFileSync(file, PNG.sync.write(png));
}

const common = {
  category: 'coffee',
  canPlaceOnWalls: false,
  canPlaceOnSurfaces: true,
  backgroundTiles: 0,
};
const size = { width: SIZE, height: SIZE, footprintW: 1, footprintH: 1 };

for (const item of COFFEE_ITEMS) {
  const dir = path.join(furnitureDir, item.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  let manifest;
  if (item.frames.length === 1) {
    writeFrame(path.join(dir, `${item.id}.png`), item.frames[0], item.id);
    manifest = { id: item.id, name: item.name, ...common, type: 'asset', ...size };
  } else {
    const members = item.frames.map((rows, i) => {
      const id = i === 0 ? item.id : `${item.id}_${i}`;
      writeFrame(path.join(dir, `${id}.png`), rows, id);
      return { type: 'asset', id, file: `${id}.png`, ...size, frame: i };
    });
    manifest = {
      id: item.id,
      name: item.name,
      ...common,
      type: 'group',
      groupType: 'animation',
      members,
    };
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

console.log(
  `Wrote ${COFFEE_ITEMS.length} coffee items: ${COFFEE_ITEMS.map((t) => t.name).join(', ')}`,
);
