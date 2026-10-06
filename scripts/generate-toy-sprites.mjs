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

function writeFrame(file, rows, toy) {
  const h = rows.length;
  const w = rows[0].length;
  if (w !== toy.fw * 16 || h !== toy.fh * 16) {
    throw new Error(`${toy.id}: ${w}x${h} does not match footprint ${toy.fw}x${toy.fh}`);
  }
  const png = new PNG({ width: w, height: h });
  rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`${toy.id}: row ${y} is ${row.length} px, not ${w}`);
    [...row].forEach((ch, x) => {
      const rgba = PALETTE[ch];
      if (!rgba) throw new Error(`${toy.id}: unknown pixel '${ch}' at ${x},${y}`);
      png.data.set(rgba, (y * w + x) * 4);
    });
  });
  fs.writeFileSync(file, PNG.sync.write(png));
}

for (const toy of TOYS) {
  const dir = path.join(furnitureDir, toy.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const common = {
    category: 'toys',
    canPlaceOnWalls: false,
    canPlaceOnSurfaces: false,
    backgroundTiles: toy.bg,
    ...(toy.rotationScheme ? { rotationScheme: toy.rotationScheme } : {}),
  };
  const size = {
    width: toy.fw * 16,
    height: toy.fh * 16,
    footprintW: toy.fw,
    footprintH: toy.fh,
  };
  let manifest;
  if (toy.side) {
    // A 2-way rotation group: the front keeps the toy's id (saved layouts load).
    const sideId = `${toy.id}_SIDE`;
    writeFrame(path.join(dir, `${toy.id}.png`), toy.rows, toy);
    writeFrame(path.join(dir, `${sideId}.png`), toy.side.rows, toy.side);
    const view = (id, t, orientation) => ({
      type: 'asset',
      id,
      file: `${id}.png`,
      width: t.fw * 16,
      height: t.fh * 16,
      footprintW: t.fw,
      footprintH: t.fh,
      orientation,
    });
    manifest = {
      id: toy.id,
      name: toy.name,
      ...common,
      type: 'group',
      groupType: 'rotation',
      rotationScheme: '2-way',
      members: [view(toy.id, toy, 'front'), view(sideId, toy.side, 'side')],
    };
  } else if (!toy.frames) {
    writeFrame(path.join(dir, `${toy.id}.png`), toy.rows, toy);
    const { category, ...placing } = common;
    manifest = { id: toy.id, name: toy.name, category, type: 'asset', ...placing, ...size };
  } else {
    // An animation group: frame 0 is the placed toy, the rest its motion.
    const members = toy.frames.map((rows, i) => {
      const id = i === 0 ? toy.id : `${toy.id}_${i}`;
      writeFrame(path.join(dir, `${id}.png`), rows, toy);
      return { type: 'asset', id, file: `${id}.png`, ...size, frame: i };
    });
    manifest = {
      id: toy.id,
      name: toy.name,
      ...common,
      type: 'group',
      groupType: 'animation',
      members,
    };
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

console.log(`Wrote ${TOYS.length} toys: ${TOYS.map((t) => t.name).join(', ')}`);
