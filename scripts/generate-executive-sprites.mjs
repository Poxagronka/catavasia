#!/usr/bin/env node
// Generates the Cat CEO office furniture (assets/furniture/<ID>/ + manifest.json):
// the executive desk, the executive chair (front, back, side) and the CEO plaque.
//
//   node scripts/generate-executive-sprites.mjs
//
// The art is drawn in scripts/executive/executiveArt.mjs and is MIT like the
// rest of the repo. The desk lands in the "desks" tab, the chair in "chairs",
// the plaque in "wall".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

import { EXECUTIVE_ITEMS, PALETTE } from './executive/executiveArt.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const furnitureDir = path.join(root, 'webview-ui', 'public', 'assets', 'furniture');
const TILE = 16;

/** Writes one PNG; returns its size and footprint (whole tiles). */
function writePng(file, rows, id) {
  const h = rows.length;
  const w = rows[0].length;
  if (w % TILE || h % TILE) throw new Error(`${id}: ${w}x${h} is not whole tiles`);
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
  return { width: w, height: h, footprintW: w / TILE, footprintH: h / TILE };
}

for (const item of EXECUTIVE_ITEMS) {
  const dir = path.join(furnitureDir, item.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const common = {
    id: item.id,
    name: item.name,
    category: item.category,
    canPlaceOnWalls: item.canPlaceOnWalls ?? false,
    canPlaceOnSurfaces: false,
    backgroundTiles: item.backgroundTiles,
  };
  let manifest;
  if (item.members) {
    const members = item.members.map((m) => {
      const id = `${item.id}_${m.orientation.toUpperCase()}`;
      const size = writePng(path.join(dir, `${id}.png`), m.rows, id);
      return {
        type: 'asset',
        id,
        file: `${id}.png`,
        ...size,
        orientation: m.orientation,
        ...(m.mirrorSide ? { mirrorSide: true } : {}),
      };
    });
    manifest = {
      ...common,
      type: 'group',
      groupType: 'rotation',
      rotationScheme: item.rotationScheme,
      members,
    };
  } else {
    const size = writePng(path.join(dir, `${item.id}.png`), item.rows, item.id);
    manifest = { ...common, type: 'asset', ...size };
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

console.log(
  `Wrote ${EXECUTIVE_ITEMS.length} executive items: ${EXECUTIVE_ITEMS.map((t) => t.name).join(', ')}`,
);
