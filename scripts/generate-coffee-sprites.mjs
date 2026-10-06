#!/usr/bin/env node
// Generates the coffee corner furniture (assets/furniture/<ID>/ + manifest.json).
//
//   node scripts/generate-coffee-sprites.mjs
//
// The art is hand-authored pixel templates in scripts/coffee/coffeeArt.mjs
// and is MIT like the rest of the repo. Items land in the "coffee" catalog
// category. A brewer is a rotation group (front / side / back views, see
// coffee/coffeeViews.mjs) of animation groups: frame 0 is the placed item,
// the other frames are its brewing look (see coffeeArt.mjs), chosen by the cats.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

import { COFFEE_ITEMS, PALETTE } from './coffee/coffeeArt.mjs';
import { EXTRA_VIEWS, flip, FLIPPED_VIEW_IDS } from './coffee/coffeeViews.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const furnitureDir = path.join(root, 'webview-ui', 'public', 'assets', 'furniture');
const SIZE = 16;
// The art is 16x16; the PNG is 16x32 on a 1x1 footprint. The renderer
// anchors a sprite taller than its footprint at the footprint's bottom, so
// the extra rows rise into the tile behind. The base of every view lands on
// BASE_ROW: 6 px into the item's own tile, where the PC stands on a desk, so
// a machine on a table's front row stands on the top, not over the edge.
const HEIGHT = 32;
const BASE_ROW = 22;

/** Last row with a visible pixel. */
function bottomRow(rows) {
  for (let y = rows.length - 1; y >= 0; y--) if (/[^.]/.test(rows[y])) return y;
  throw new Error('empty frame');
}

function writeFrame(file, rows, id, shift) {
  const png = new PNG({ width: SIZE, height: HEIGHT });
  png.data.fill(0);
  if (rows.length !== SIZE) throw new Error(`${id}: ${rows.length} rows, not ${SIZE}`);
  rows.forEach((row, y) => {
    if (row.length !== SIZE) throw new Error(`${id}: row ${y} is ${row.length} px, not ${SIZE}`);
    [...row].forEach((ch, x) => {
      const rgba = PALETTE[ch];
      if (!rgba) throw new Error(`${id}: unknown pixel '${ch}' at ${x},${y}`);
      png.data.set(rgba, ((y + shift) * SIZE + x) * 4);
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
const size = { width: SIZE, height: HEIGHT, footprintW: 1, footprintH: 1 };

/** One view (all frames share the shift of frame 0, so the base never moves). */
function writeView(dir, prefix, viewFrames, extra = {}) {
  const shift = BASE_ROW - bottomRow(viewFrames[0]);
  return viewFrames.map((rows, i) => {
    const id = i === 0 ? prefix : `${prefix}_${i}`;
    writeFrame(path.join(dir, `${id}.png`), rows, id, shift);
    return { type: 'asset', id, file: `${id}.png`, ...size, frame: i, ...(i === 0 ? extra : {}) };
  });
}

const animation = (orientation, members) => ({
  type: 'group',
  groupType: 'animation',
  orientation,
  members,
});

for (const item of COFFEE_ITEMS) {
  const dir = path.join(furnitureDir, item.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  let manifest;
  if (item.frames.length === 1) {
    const shift = BASE_ROW - bottomRow(item.frames[0]);
    writeFrame(path.join(dir, `${item.id}.png`), item.frames[0], item.id, shift);
    manifest = { id: item.id, name: item.name, ...common, type: 'asset', ...size };
  } else {
    // A brewer is a rotation group of animation groups, one per view. The
    // front frames keep their old ids, so saved layouts still load.
    const extra = EXTRA_VIEWS[item.id];
    const side = extra?.side ?? (FLIPPED_VIEW_IDS.includes(item.id) ? item.frames.map(flip) : null);
    if (!side) throw new Error(`${item.id}: no side view`);
    const members = [
      animation('front', writeView(dir, item.id, item.frames)),
      // Only machines with a back view mirror the side for "left" (3-way);
      // a round pot's mirrored side is its front again (2-way).
      animation('side', writeView(dir, `${item.id}_SIDE`, side, extra ? { mirrorSide: true } : {})),
      ...(extra?.back ? [animation('back', writeView(dir, `${item.id}_BACK`, extra.back))] : []),
    ];
    manifest = {
      id: item.id,
      name: item.name,
      ...common,
      type: 'group',
      groupType: 'rotation',
      rotationScheme: extra ? '3-way-mirror' : '2-way',
      members,
    };
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

console.log(
  `Wrote ${COFFEE_ITEMS.length} coffee items: ${COFFEE_ITEMS.map((t) => t.name).join(', ')}`,
);
