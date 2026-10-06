// Furniture previews (docs/catavasia/furniture.md, skill add-furniture):
//
//   npx tsx scripts/preview-furniture.ts <TYPE> [--out DIR] [--sec N]
//     every view of the item (R order) × every cat activity at it: a GIF of
//     three coats side by side, plus a strip of the distinct frames.
//   npx tsx scripts/preview-furniture.ts <DESK> --work [--chair WOODEN_CHAIR]
//     a desk or table in every view with a chair on its working side and a cat
//     typing there (three coats). EXECUTIVE_CHAIR is held for the Cat CEO:
//     preview the executive desk with CUSHIONED_CHAIR.
//   npx tsx scripts/preview-furniture.ts <TYPE> --states
//     every view's off sprite and its "on" animation (a PC switching on).
//   npx tsx scripts/preview-furniture.ts --sheet [--out DIR]
//     the orientation sheet: every catalog item in every view.
//
// Output defaults to ./preview-out (git-ignored).
import fs from 'node:fs';
import path from 'node:path';

import type { Appearance } from '../webview-ui/src/cats/catsApi.ts';
import { renderAppearance } from '../webview-ui/src/cats/catArt.ts';
import { IDLE_ACTIVITIES } from '../webview-ui/src/office/engine/idleActivities.ts';
import { OfficeState } from '../webview-ui/src/office/engine/officeState.ts';
import {
  FURNITURE_CATEGORIES,
  getAnimationFrames,
  getCatalogByCategory,
  getCatalogEntry,
  getOnStateType,
  getRotatedType,
} from '../webview-ui/src/office/layout/furnitureCatalog.ts';
import { itemFrame, sideDirection } from '../webview-ui/src/office/layout/itemFrame.ts';
import {
  furnitureSpriteTop,
  getBlockedTiles,
  layoutToSeats,
  layoutToTileMap,
} from '../webview-ui/src/office/layout/layoutSerializer.ts';
import { spritesFromSheet } from '../webview-ui/src/office/sprites/spriteData.ts';
import type { OfficeLayout, PlacedFurniture } from '../webview-ui/src/office/types.ts';
import { CharacterState, Direction, TILE_SIZE, TileType } from '../webview-ui/src/office/types.ts';
import { Img, loadCatalog, renderOffice } from './preview/compose.ts';
import { encodeGif } from './preview/gif.mjs';

/** The three coats of every preview (like the PR #39 previews). */
const COATS: Appearance[] = [
  { breed: 'marmalade' },
  { breed: 'shadow' },
  {
    breed: 'patches',
    pattern: 'calico',
    eyes: '#4aa0e8',
    colors: { fur: '#f6f2ec', patchA: '#e8c496', patchB: '#8c92a4' },
  },
];
const FPS = 20;
const ROOM = 11;
const WALL_ROWS = 3;

const args = process.argv.slice(2);
const opt = (name: string, dflt: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const OUT = path.resolve(opt('--out', 'preview-out'));
const SECONDS = Number(opt('--sec', '14'));

/** The item's views in R order. */
function views(type: string): string[] {
  const out = [type];
  for (let t = getRotatedType(type, 'cw'); t && t !== type; t = getRotatedType(t, 'cw'))
    out.push(t);
  return out;
}

function room(type: string): { os: OfficeState; item: PlacedFurniture } {
  const entry = getCatalogEntry(type)!;
  const tiles = Array.from({ length: ROOM * ROOM }, (_, i) =>
    i < WALL_ROWS * ROOM ? TileType.WALL : TileType.FLOOR_1,
  );
  const col = Math.floor((ROOM - entry.footprintW) / 2);
  const row = entry.canPlaceOnWalls ? WALL_ROWS - entry.footprintH : 5;
  const item: PlacedFurniture = { uid: 'item', type, col, row };
  const layout = { version: 1, cols: ROOM, rows: ROOM, tiles, furniture: [item] } as OfficeLayout;
  return { os: new OfficeState(layout), item };
}

/** Activities with a spot at the item (its own spots, not fallbacks). */
function activitiesAt(os: OfficeState): string[] {
  const layout = os.getLayout();
  const ctx = {
    furniture: layout.furniture,
    seats: layoutToSeats(layout.furniture),
    tileMap: layoutToTileMap(layout),
    blockedTiles: getBlockedTiles(layout.furniture),
  };
  return IDLE_ACTIVITIES.filter((d) => (d.spots?.(ctx).length ?? 0) > 0).map((d) => d.id);
}

/** Crop around the item: a tile of floor on each side, the sprite top and a standing cat above. */
function cropRect(item: PlacedFurniture) {
  const e = getCatalogEntry(item.type)!;
  const top = Math.min(furnitureSpriteTop(item.row, e.footprintH, e.sprite.length), item.row * 16);
  const x = Math.max(0, (item.col - 1) * TILE_SIZE);
  const y = Math.max(0, top - 40);
  const right = Math.min(ROOM * TILE_SIZE, (item.col + e.footprintW + 1) * TILE_SIZE);
  const bottom = Math.min(ROOM * TILE_SIZE, (item.row + e.footprintH + 1) * TILE_SIZE);
  return { x, y, w: right - x, h: bottom - y };
}

function seed(s: number): void {
  Math.random = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Agent 1 in `coat`, idle (or at work) at its start tile. */
function addCat(os: OfficeState, coat: Appearance, seat?: string) {
  os.addAgent(1, 0, 0, seat, true);
  os.setAgentActive(1, !!seat);
  const ch = os.characters.get(1)!;
  ch.customSprites = spritesFromSheet(renderAppearance(coat));
  return ch;
}

/** One coat doing `activity` at the item in view `type`: cropped frames. */
function record(type: string, activity: string, coat: Appearance): Img[] {
  seed(7);
  const { os, item } = room(type);
  const ch = addCat(os, coat);
  ch.state = CharacterState.IDLE;
  ch.wanderTimer = 999;
  ch.tileCol = 1;
  ch.tileRow = ROOM - 2;
  ch.x = ch.tileCol * TILE_SIZE + 8;
  ch.y = ch.tileRow * TILE_SIZE + 8;
  if (!os.forceIdleActivity(1, activity)) throw new Error(`${type}: cannot start ${activity}`);
  const dt = 1 / FPS;
  for (let i = 0; i < 4000 && ch.state !== CharacterState.ACTIVITY; i++) os.update(dt);
  const rect = cropRect(item);
  const frames: Img[] = [];
  for (let i = 0; i < SECONDS * FPS; i++) {
    os.update(dt);
    if (ch.state !== CharacterState.ACTIVITY && ch.lastActivityId === activity) break;
    const full = renderOffice(os, i * dt);
    const img = new Img(rect.w, rect.h);
    img.paste(full, -rect.x, -rect.y);
    frames.push(img);
  }
  return frames;
}

function sideBySide(panels: Img[][]): Img[] {
  const n = Math.max(...panels.map((p) => p.length));
  const { w, h } = panels[0][0];
  return Array.from({ length: n }, (_, i) => {
    const img = new Img(w * panels.length + 2 * (panels.length - 1), h);
    img.fill('#28282f');
    panels.forEach((p, k) => img.paste(p[Math.min(i, p.length - 1)], k * (w + 2), 0));
    return img;
  });
}

/** Distinct consecutive frames (up to 24), 6 per row. */
function strip(frames: Img[]): Img {
  const uniq: Img[] = [];
  for (const f of frames)
    if (!uniq.length || Buffer.compare(f.data, uniq[uniq.length - 1].data) !== 0) uniq.push(f);
  const list = uniq.slice(0, 24);
  const per = Math.min(6, list.length);
  const { w, h } = list[0];
  const out = new Img(per * (w + 2), Math.ceil(list.length / per) * (h + 2));
  out.fill('#28282f');
  list.forEach((f, i) => out.paste(f, (i % per) * (w + 2), Math.floor(i / per) * (h + 2)));
  return out;
}

const safe = (t: string) => t.replace(':', '-');

/** The chair view whose seat faces `dir` (`<CHAIR>_FRONT` faces down). */
function chairFacing(chair: string, dir: Direction): string {
  if (dir === Direction.DOWN) return `${chair}_FRONT`;
  if (dir === Direction.UP) return `${chair}_BACK`;
  return dir === Direction.RIGHT ? `${chair}_SIDE` : `${chair}_SIDE:left`;
}

/**
 * The desk alone with a chair on its working side (the item-local back: the
 * front view's top row, where the Cat CEO sits) and a cat typing on it.
 */
function recordWork(desk: string, chair: string, coat: Appearance): Img[] {
  seed(7);
  const e = getCatalogEntry(desk)!;
  const col = Math.floor((ROOM - e.footprintW) / 2);
  const row = 4;
  const bg = e.backgroundTiles ?? 0;
  const user = sideDirection(itemFrame(desk), 'back');
  const midCol = col + Math.floor(e.footprintW / 2);
  const midRow = row + bg + Math.floor((e.footprintH - bg) / 2);
  const seatAt = {
    [Direction.UP]: { col: midCol, row: bg > 0 ? row : row - 1 },
    [Direction.DOWN]: { col: midCol, row: row + e.footprintH },
    [Direction.LEFT]: { col: col - 1, row: midRow },
    [Direction.RIGHT]: { col: col + e.footprintW, row: midRow },
  }[user];
  const opposite = {
    [Direction.UP]: Direction.DOWN,
    [Direction.DOWN]: Direction.UP,
    [Direction.LEFT]: Direction.RIGHT,
    [Direction.RIGHT]: Direction.LEFT,
  }[user];
  const chairType = chairFacing(chair, opposite);
  const tiles = Array.from({ length: ROOM * ROOM }, () => TileType.FLOOR_1);
  const furniture: PlacedFurniture[] = [
    { uid: 'desk', type: desk, col, row },
    // The seat is the chair's first blocked row: a tall chair starts above it.
    {
      uid: 'chair',
      type: chairType,
      col: seatAt.col,
      row: seatAt.row - (getCatalogEntry(chairType)!.backgroundTiles ?? 0),
    },
  ];
  const layout = { version: 1, cols: ROOM, rows: ROOM, tiles, furniture } as OfficeLayout;
  const os = new OfficeState(layout);
  addCat(os, coat, 'chair');
  const dt = 1 / FPS;
  for (let i = 0; i < FPS * 2; i++) os.update(dt);
  const x0 = Math.max(0, (Math.min(col, seatAt.col) - 1) * TILE_SIZE);
  const y0 = Math.max(0, (Math.min(row, seatAt.row) - 2) * TILE_SIZE);
  const x1 = Math.min(ROOM, Math.max(col + e.footprintW, seatAt.col + 1) + 1) * TILE_SIZE;
  const y1 = Math.min(ROOM, Math.max(row + e.footprintH, seatAt.row + 1) + 1) * TILE_SIZE;
  const frames: Img[] = [];
  for (let i = 0; i < 3 * FPS; i++) {
    os.update(dt);
    const img = new Img(x1 - x0, y1 - y0);
    img.paste(renderOffice(os, i * dt), -x0, -y0);
    frames.push(img);
  }
  return frames;
}

/** Each view: its off sprite, then its "on" frames twice (no cat). */
function recordStates(view: string): Img[] {
  const on = getOnStateType(view);
  if (on === view) return [];
  const [base, suffix] = on.split(':');
  const ids = (getAnimationFrames(base) ?? [base]).map((f) => (suffix ? `${f}:${suffix}` : f));
  const seq = [view, view, ...ids, ...ids, ...ids];
  return seq.map((id) => {
    const s = getCatalogEntry(id)!.sprite;
    const img = new Img(s[0].length + 8, s.length + 8);
    img.fill('#c9b79c');
    img.sprite(s, 4, 4, id.endsWith(':left'));
    return img;
  });
}

function writeClip(name: string, frames: Img[], ms: number): void {
  const base = path.join(OUT, name);
  fs.writeFileSync(`${base}.gif`, encodeGif(frames, ms, 4));
  strip(frames).writePng(`${base}-strip.png`, 4);
  console.log(`${base}.gif (${frames.length} frames)`);
}

function previewItem(type: string): void {
  for (const view of views(type)) {
    for (const activity of activitiesAt(room(view).os)) {
      const frames = sideBySide(COATS.map((c) => record(view, activity, c)));
      writeClip(`${safe(view)}-${activity}`, frames, 1000 / FPS);
    }
  }
}

/** Every catalog item in every view: three items (four view cells each) per row. */
function sheet(): void {
  const items = FURNITURE_CATEGORIES.flatMap((c) => getCatalogByCategory(c.id).map((e) => e.type));
  const cell = 66;
  const perRow = 3;
  const blockW = 4 * cell + 12;
  const img = new Img(perRow * blockW, Math.ceil(items.length / perRow) * (cell + 6));
  img.fill('#28282f');
  items.forEach((type, i) => {
    const bx = (i % perRow) * blockW;
    const by = Math.floor(i / perRow) * (cell + 6);
    for (let x = 0; x < 4 * cell; x++) img.put(bx + x, by + cell, '#4a4a56');
    views(type).forEach((view, c) => {
      const e = getCatalogEntry(view)!;
      const s = e.sprite;
      const x = bx + c * cell + Math.floor((cell - s[0].length) / 2);
      const y = by + cell - s.length;
      img.sprite(s, x, y, !!e.mirrorSide && view.endsWith(':left'));
    });
  });
  const file = path.join(OUT, 'orientation-sheet.png');
  img.writePng(file, 3);
  console.log(`${file}: ${items.length} items`);
  console.log(items.map((t) => `${t}: ${views(t).join(' → ')}`).join('\n'));
}

loadCatalog();
fs.mkdirSync(OUT, { recursive: true });
const target = args[0] && !args[0].startsWith('--') ? args[0] : null;
if (args.includes('--sheet')) sheet();
else if (target && args.includes('--work')) {
  const chair = opt('--chair', 'WOODEN_CHAIR');
  for (const view of views(target))
    writeClip(
      `${safe(view)}-work`,
      sideBySide(COATS.map((c) => recordWork(view, chair, c))),
      1000 / FPS,
    );
} else if (target && args.includes('--states')) {
  for (const view of views(target)) {
    const frames = recordStates(view);
    if (frames.length) writeClip(`${safe(view)}-states`, frames, 250);
  }
} else if (target) previewItem(target);
else
  throw new Error(
    'usage: preview-furniture.ts <TYPE> [--work [--chair ID] | --states] | --sheet [--out DIR]',
  );
