// Social-scene art for the cat characters: per-breed talking frames, plus the shared overlay sheet (see socialOverlays.mjs).
//
// The per-breed frames are derived from the finished idle frame of
// renderCatFrames(), so every breed (pattern, ears, tail, ruff) stays in style
// without a second set of pose templates. Output is one JSON file the webview
// imports: webview-ui/src/office/sprites/cat-social.json. Pure (no node:fs):
// the webview also runs renderSocialCatFrames for custom coats (cats/catArt.ts).
//
// Encoding: every frame is a list of row strings. Each character indexes the
// owning palette as (charCode - 48). Palette entry 0 is transparent ('').

import { colorize } from './breeds.mjs';
import { Frame, FRAME_H, FRAME_W } from './canvas.mjs';
import { renderCatFrames } from './poses.mjs';
import { OVERLAY_PALETTE, renderOverlays } from './socialOverlays.mjs';

const DIRS = ['down', 'up', 'right'];
const IDLE_FRAME = 1;
/** Strip the outer outline and whisker overlay so the body can grow. */
function bodyOnly(grid) {
  const whiskers = [];
  const cells = grid.map((row, y) =>
    row.map((c, x) => {
      if (!c) return null;
      if (c.part === 'overlay') {
        whiskers.push([x, y, c.label]);
        return null;
      }
      return c.part === 'edge' ? null : { ...c };
    }),
  );
  return { cells, whiskers };
}

/** Re-run the outline pass on a cell grid; whiskers go back on top. */
function refinish(cells, whiskers) {
  const fr = new Frame();
  fr.cells = cells;
  for (const [x, y, label] of whiskers) fr.addOverlay(x, y, label);
  return fr.finish();
}

/** Open mouth below the muzzle line (talk). */
function openMouth(cells, dir) {
  const mouth =
    dir === 'right'
      ? [[9, 7]]
      : [
          [5, 7],
          [6, 7],
        ];
  for (const row of cells)
    for (const c of row) {
      if (!c || c.part !== 'head') continue;
      if (mouth.some(([lx, ly]) => c.lx === lx && c.ly === ly)) c.label = 'earIn';
      if (dir !== 'right' && c.ly === 6 && (c.lx === 5 || c.lx === 6)) c.label = 'line';
    }
}

function talkFrame(idle, dir) {
  if (dir === 'up') return idle;
  const { cells, whiskers } = bodyOnly(idle);
  openMouth(cells, dir);
  return refinish(cells, whiskers);
}

/** rows[dir] = { talk: [grid] } for one breed. */
export function renderSocialCatFrames(breed) {
  const frames = renderCatFrames(breed);
  const out = {};
  DIRS.forEach((dir, d) => {
    const idle = frames[d][IDLE_FRAME];
    out[dir] = { talk: [talkFrame(idle, dir)] };
  });
  return out;
}

const hex = ([r, g, b, a]) =>
  a === 0 ? '' : '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

/** Palette-encode RGBA grids: returns { palette, frames } with one palette. */
function encoder() {
  const palette = [''];
  const index = new Map([['', 0]]);
  const encode = (rgbaRows) =>
    rgbaRows.map((row) =>
      row
        .map((rgba) => {
          const key = hex(rgba);
          if (!index.has(key)) {
            index.set(key, palette.length);
            palette.push(key);
          }
          return String.fromCharCode(48 + index.get(key));
        })
        .join(''),
    );
  return { palette, encode };
}

/** RGBA rows for one breed frame. */
export function colorFrame(breed, grid, dir) {
  return grid.map((line) => line.map((cell) => colorize(breed, cell, dir)));
}

/** The whole sheet as plain JSON data (also used by the preview script). */
export function buildSocialSheet(breeds) {
  const cats = breeds.map((breed) => {
    const { palette, encode } = encoder();
    const social = renderSocialCatFrames(breed);
    const poses = { talk: {} };
    for (const dir of DIRS) {
      poses.talk[dir] = social[dir].talk.map((g) => encode(colorFrame(breed, g, dir)));
    }
    return { name: breed.name, palette, ...poses };
  });
  const keys = Object.keys(OVERLAY_PALETTE);
  const overlays = {};
  for (const [name, frames] of Object.entries(renderOverlays())) {
    overlays[name] = frames.map((rows) =>
      rows.map((row) => [...row].map((k) => String.fromCharCode(48 + keys.indexOf(k))).join('')),
    );
  }
  return {
    generator: 'scripts/generate-cat-sprites.mjs (scripts/cats/social.mjs)',
    frameW: FRAME_W,
    frameH: FRAME_H,
    overlayPalette: keys.map((k) => OVERLAY_PALETTE[k]),
    overlays,
    cats,
  };
}
