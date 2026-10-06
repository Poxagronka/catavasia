// The PC's "on" state in every view (assets/furniture/PC/). The upstream art
// has an on-state (3 animated frames) for the front only, so a PC turned to
// its side or back could not switch on. This draws the side and back on
// frames from the upstream off sprites: the side lights the screen edge and
// throws green screen light on the keyboard side; the back glows round the
// monitor's edges and lights a power LED. Three frames flicker like the front.
// Rewrites the manifest with a state group per view (ids of the off sprites
// and the front frames stay, so saved layouts load).
//   node scripts/generate-pc-sprites.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'webview-ui', 'public', 'assets', 'furniture', 'PC');
const read = (id) => PNG.sync.read(fs.readFileSync(path.join(dir, `${id}.png`)));

// Screen colors of the front on-state art.
const GLOW = [96, 198, 119];
const EDGE = [84, 142, 97, 255];
const LIT_KEY = [208, 236, 214, 255];
const LED = [
  [120, 255, 150, 255],
  [80, 200, 110, 255],
  [120, 255, 150, 255],
];
/** Glow alpha per frame: a soft flicker like the front's screen. */
const FLICKER = [70, 100, 85];

function clone(png) {
  const out = new PNG({ width: png.width, height: png.height });
  png.data.copy(out.data);
  return out;
}
const at = (png, x, y) => (y * png.width + x) * 4;
const alpha = (png, x, y) => png.data[at(png, x, y) + 3];
const put = (png, x, y, rgba) => png.data.set(rgba, at(png, x, y));
const bright = (png, x, y) =>
  png.data[at(png, x, y)] + png.data[at(png, x, y) + 1] + png.data[at(png, x, y) + 2];

/**
 * Side view: the screen is the monitor's left face (column 5, rows 8-15),
 * the keyboard and mouse sit left of it. Light falls in front of the
 * screen and on the keys nearest to it.
 */
function sideFrame(off, f) {
  const png = clone(off);
  for (let y = 8; y <= 15; y++) if (alpha(png, 5, y)) put(png, 5, y, EDGE);
  // Light in front of the screen face, strongest next to it.
  for (let y = 6; y <= 15; y++)
    for (let x = 1; x <= 4; x++)
      if (!alpha(png, x, y))
        put(png, x, y, [...GLOW, Math.round(FLICKER[f] * (0.35 + 0.3 * (x - 1)))]);
  for (const [x, y] of [
    [2, 11],
    [3, 11],
    [2, 14],
    [3, 15],
  ])
    if (alpha(png, x, y) && bright(png, x, y) > 500) put(png, x, y, LIT_KEY);
  put(png, 12, 20, LED[f]);
  return png;
}

/** Back view: a glow one pixel round the monitor (rows above the stand) and a power LED. */
function backFrame(off, f) {
  const png = clone(off);
  for (let y = 0; y <= 17; y++)
    for (let x = 0; x < off.width; x++) {
      if (alpha(off, x, y)) continue;
      const near = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => {
        const X = x + dx;
        const Y = y + dy;
        return X >= 0 && Y >= 0 && X < off.width && Y < off.height && alpha(off, X, Y) > 0;
      });
      if (near) put(png, x, y, [...GLOW, FLICKER[f]]);
    }
  put(png, 11, 15, LED[f]);
  return png;
}

const asset = (id, extra) => ({
  type: 'asset',
  id,
  file: `${id}.png`,
  width: 16,
  height: 32,
  footprintW: 1,
  footprintH: 2,
  ...extra,
});
const onFrames = (prefix, make, off, extra = {}) =>
  [0, 1, 2].map((f) => {
    const id = `${prefix}_ON_${f + 1}`;
    fs.writeFileSync(path.join(dir, `${id}.png`), PNG.sync.write(make(off, f)));
    return asset(id, { frame: f, ...extra });
  });
const stateView = (orientation, on, off) => ({
  type: 'group',
  groupType: 'state',
  orientation,
  members: [{ type: 'group', groupType: 'animation', state: 'on', members: on }, off],
});

const manifest = {
  id: 'PC',
  name: 'PC',
  category: 'electronics',
  type: 'group',
  groupType: 'rotation',
  rotationScheme: '3-way-mirror',
  canPlaceOnWalls: false,
  canPlaceOnSurfaces: true,
  backgroundTiles: 1,
  members: [
    stateView(
      'front',
      [1, 2, 3].map((n, f) => asset(`PC_FRONT_ON_${n}`, { frame: f })),
      asset('PC_FRONT_OFF', { state: 'off' }),
    ),
    stateView(
      'back',
      onFrames('PC_BACK', backFrame, read('PC_BACK')),
      asset('PC_BACK', { state: 'off' }),
    ),
    // Every side sprite mirrors for the left view, the on frames too.
    stateView(
      'side',
      onFrames('PC_SIDE', sideFrame, read('PC_SIDE'), { mirrorSide: true }),
      asset('PC_SIDE', { state: 'off', mirrorSide: true }),
    ),
  ],
};
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Wrote the PC on-state frames for its side and back, and the manifest');
