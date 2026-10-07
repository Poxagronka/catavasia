#!/usr/bin/env node
// Generates the legendary paintings (assets/furniture/<ID>/<ID>.png + manifest.json):
// homages after Rothko, Moebius, Rubens and Aivazovsky.
//
//   node scripts/generate-painting-sprites.mjs
//
// The art is drawn in scripts/paintings/ and is MIT like the rest of the repo.
// The paintings land in the "wall" tab. A painting must not flip (a mirrored
// masterpiece reads wrong), so each one is "symmetric": R leaves it as it is.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

import { paintingAivazovsky } from './paintings/aivazovskyArt.mjs';
import { paintingMoebius } from './paintings/moebiusArt.mjs';
import { paintingRothko } from './paintings/rothkoArt.mjs';
import { paintingRubens } from './paintings/rubensArt.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const furnitureDir = path.join(root, 'webview-ui', 'public', 'assets', 'furniture');
const TILE = 16;

const PAINTINGS = [
  { id: 'PAINTING_ROTHKO', name: 'Rust and Blue (after Rothko)', draw: paintingRothko },
  { id: 'PAINTING_MOEBIUS', name: 'Desert Rider (after Moebius)', draw: paintingMoebius },
  { id: 'PAINTING_RUBENS', name: 'The Descent (after Rubens)', draw: paintingRubens },
  {
    id: 'PAINTING_AIVAZOVSKY',
    name: 'The Ninth Wave (after Aivazovsky)',
    draw: paintingAivazovsky,
  },
];

for (const { id, name, draw } of PAINTINGS) {
  const c = draw();
  if (c.w % TILE || c.h % TILE) throw new Error(`${id}: ${c.w}x${c.h} is not whole tiles`);
  const dir = path.join(furnitureDir, id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const png = new PNG({ width: c.w, height: c.h });
  png.data.set(c.data);
  fs.writeFileSync(path.join(dir, `${id}.png`), PNG.sync.write(png));
  const manifest = {
    id,
    name,
    category: 'wall',
    type: 'asset',
    rotationScheme: 'symmetric',
    canPlaceOnWalls: true,
    canPlaceOnSurfaces: false,
    backgroundTiles: 0,
    width: c.w,
    height: c.h,
    footprintW: c.w / TILE,
    footprintH: c.h / TILE,
  };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

console.log(`Wrote ${PAINTINGS.length} paintings: ${PAINTINGS.map((p) => p.id).join(', ')}`);
