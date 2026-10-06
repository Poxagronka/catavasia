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

/** Write one view's PNG; returns its size. */
function writePng(file, rows, id) {
  const h = rows.length;
  const w = rows[0].length;
  const png = new PNG({ width: w, height: h });
  rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`${id}: row ${y} is ${row.length} px, not ${w}`);
    [...row].forEach((ch, x) => {
      const rgba = PALETTE[ch];
      if (!rgba) throw new Error(`${id}: unknown pixel '${ch}' at ${x},${y}`);
      png.data.set(rgba, (y * w + x) * 4);
    });
  });
  fs.writeFileSync(file, PNG.sync.write(png));
  return { width: w, height: h };
}

for (const item of items) {
  const h = item.rows.length;
  const w = item.rows[0].length;
  if (w !== item.fw * 16 || h !== item.fh * 16) {
    throw new Error(`${item.id}: ${w}x${h} does not match footprint ${item.fw}x${item.fh}`);
  }
  const dir = path.join(furnitureDir, item.id);
  fs.mkdirSync(dir, { recursive: true });
  writePng(path.join(dir, `${item.id}.png`), item.rows, item.id);
  const common = {
    id: item.id,
    name: item.name,
    category: 'beds',
    canPlaceOnWalls: false,
    canPlaceOnSurfaces: false,
    backgroundTiles: item.bg,
  };
  const size = { width: w, height: h, footprintW: item.fw, footprintH: item.fh };
  let manifest;
  if (item.side) {
    // A drawn side view, mirrored for the left (3-way-mirror without a back).
    // The front keeps the bed's id: saved layouts still load.
    const sideId = `${item.id}_SIDE`;
    writePng(path.join(dir, `${sideId}.png`), item.side.rows, sideId);
    const view = (id, orientation, extra = {}) => ({
      type: 'asset',
      id,
      file: `${id}.png`,
      ...size,
      orientation,
      ...extra,
    });
    manifest = {
      ...common,
      type: 'group',
      groupType: 'rotation',
      rotationScheme: '3-way-mirror',
      members: [view(item.id, 'front'), view(sideId, 'side', { mirrorSide: true })],
    };
  } else {
    const { id, name, category, ...placing } = common;
    manifest = {
      id,
      name,
      category,
      type: 'asset',
      ...placing,
      ...size,
      ...(item.rotationScheme ? { rotationScheme: item.rotationScheme } : {}),
    };
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

console.log(`Wrote ${items.length} beds: ${items.map((t) => t.name).join(', ')}`);
