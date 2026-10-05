// Social-scene art for the cat characters: per-breed angry (puffed-up) and
// talking frames, plus the shared overlay sheet (see socialOverlays.mjs).
//
// The per-breed frames are derived from the finished idle frame of
// renderCatFrames(), so every breed (pattern, ears, tail, ruff) stays in style
// without a second set of pose templates. Output is one JSON file the webview
// imports: webview-ui/src/office/sprites/cat-social.json.
//
// Encoding: every frame is a list of row strings. Each character indexes the
// owning palette as (charCode - 48). Palette entry 0 is transparent ('').

import fs from 'node:fs';

import { colorize } from './breeds.mjs';
import { Frame, FRAME_H, FRAME_W } from './canvas.mjs';
import { renderCatFrames } from './poses.mjs';
import { OVERLAY_PALETTE, renderOverlays } from './socialOverlays.mjs';

const DIRS = ['down', 'up', 'right'];
const IDLE_FRAME = 1;
const PUFF_PARTS = new Set(['torso', 'tail', 'head', 'armL', 'armR']);
const PUFF_LABELS = new Set(['fur', 'shade', 'light', 'tailTip']);
/** Rows above the feet: spikes never grow around the paws. */
const PUFF_MAX_Y = FRAME_H - 5;

const at = (g, x, y) => (x < 0 || y < 0 || x >= FRAME_W || y >= FRAME_H ? null : g[y][x]);
const nbrs4 = (g, x, y) => [at(g, x + 1, y), at(g, x - 1, y), at(g, x, y + 1), at(g, x, y - 1)];

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

/** Copy of a neighbour cell for a grown pixel, so coat patterns follow it. */
function grownFrom(c) {
  return { ...c, rim: false, z: (c.z ?? 0) - 0.1 };
}

/**
 * Puffed-up fur: a jagged 1-px layer of spikes on every furry edge (the
 * parity picks which pixels stick out, so two parities read as bristling),
 * and a fully bushed-out tail.
 */
function puff(cells, parity) {
  const out = cells.map((row) => row.slice());
  for (let y = 0; y < FRAME_H; y++) {
    for (let x = 0; x < FRAME_W; x++) {
      if (cells[y][x] || y > PUFF_MAX_Y) continue;
      const src = nbrs4(cells, x, y).find(
        (n) => n && PUFF_PARTS.has(n.part) && PUFF_LABELS.has(n.label),
      );
      if (!src) continue;
      if (src.part === 'tail' || (x + y + parity) % 2 === 0) out[y][x] = grownFrom(src);
    }
  }
  return out;
}

/** Narrow the eyes: the top eye row becomes a lid line. */
function angryEyes(cells) {
  for (const row of cells)
    for (const c of row) {
      if (!c || c.part !== 'head' || c.ly !== 3) continue;
      if (c.label === 'eye' || c.label === 'pupil') c.label = 'line';
    }
}

/** Open mouth below the muzzle line ("talk" / "hiss"). */
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

/** Shift every row up by one pixel (a small hop). */
function hop(grid) {
  return [...grid.slice(1), new Array(FRAME_W).fill(null)];
}

function angryFrame(idle, dir, parity) {
  const { cells, whiskers } = bodyOnly(idle);
  angryEyes(cells);
  if (dir !== 'up') openMouth(cells, dir);
  const grid = refinish(puff(cells, parity), whiskers);
  return parity === 1 ? hop(grid) : grid;
}

function talkFrame(idle, dir) {
  if (dir === 'up') return idle;
  const { cells, whiskers } = bodyOnly(idle);
  openMouth(cells, dir);
  return refinish(cells, whiskers);
}

/** rows[dir] = { angry: [grid, grid], talk: [grid] } for one breed. */
export function renderSocialCatFrames(breed) {
  const frames = renderCatFrames(breed);
  const out = {};
  DIRS.forEach((dir, d) => {
    const idle = frames[d][IDLE_FRAME];
    out[dir] = {
      angry: [angryFrame(idle, dir, 0), angryFrame(idle, dir, 1)],
      talk: [talkFrame(idle, dir)],
    };
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
    const poses = { angry: {}, talk: {} };
    for (const dir of DIRS) {
      poses.angry[dir] = social[dir].angry.map((g) => encode(colorFrame(breed, g, dir)));
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

export function writeSocialSheet(file, breeds) {
  fs.writeFileSync(file, JSON.stringify(buildSocialSheet(breeds)) + '\n');
}
