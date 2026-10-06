// The long table's side view (assets/furniture/TABLE_FRONT/): the upstream
// front art (48x64, 3x4 tiles) turned a quarter, 64x48 on 4x3 tiles. The
// table is a plain top with an apron and four legs, so the side view is the
// same rows and columns with the long axis across: the top's uniform middle
// row and column stretch or shrink, the edges, apron and legs stay. Writes
// TABLE_FRONT_SIDE.png and the manifest (a 2-way rotation group).
//   node scripts/generate-table-sprites.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'webview-ui', 'public', 'assets', 'furniture', 'TABLE_FRONT');
const front = PNG.sync.read(fs.readFileSync(path.join(dir, 'TABLE_FRONT.png')));

// Front art: rows 0-12 sky and the top's back edge, 13-50 the uniform top,
// 51-63 front edge, apron and legs. Columns 0-6 and 41-47 hold the legs.
const KEEP_TOP = 13;
const KEEP_BOTTOM = 13;
const KEEP_SIDE = 7;
const W = 64;
const H = 48;

const rowMap = (y) => (y < KEEP_TOP ? y : y >= H - KEEP_BOTTOM ? y - H + front.height : KEEP_TOP);
const colMap = (x) => (x < KEEP_SIDE ? x : x >= W - KEEP_SIDE ? x - W + front.width : KEEP_SIDE);

const side = new PNG({ width: W, height: H });
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const s = (rowMap(y) * front.width + colMap(x)) * 4;
    side.data.set(front.data.subarray(s, s + 4), (y * W + x) * 4);
  }
fs.writeFileSync(path.join(dir, 'TABLE_FRONT_SIDE.png'), PNG.sync.write(side));

const asset = (id, w, h, orientation) => ({
  type: 'asset',
  id,
  file: `${id}.png`,
  width: w,
  height: h,
  footprintW: w / 16,
  footprintH: h / 16,
  orientation,
});
const manifest = {
  id: 'TABLE_FRONT',
  name: 'Table',
  category: 'desks',
  type: 'group',
  groupType: 'rotation',
  rotationScheme: '2-way',
  canPlaceOnWalls: false,
  canPlaceOnSurfaces: false,
  backgroundTiles: 1,
  // The front keeps its id: saved layouts still load.
  members: [asset('TABLE_FRONT', 48, 64, 'front'), asset('TABLE_FRONT_SIDE', W, H, 'side')],
};
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Wrote TABLE_FRONT_SIDE (64x48) and the TABLE_FRONT rotation group');
