// Pet interaction previews: a cat pet (Gitcat, and a repainted coat) doing
// every activity it can do at every catalog item, in every view of the item.
// Writes a GIF and a frame strip per view × activity, like
// preview-furniture.ts does for the agent cats (docs/catavasia/pet-interactions.md).
//
//   npx tsx scripts/preview-pets.ts [--out DIR] [--sec N] [--only ACTIVITY]
import fs from 'node:fs';
import path from 'node:path';

import { decodePetPng } from '../core/src/assets/pngDecoder.ts';
import { IDLE_ACTIVITIES } from '../webview-ui/src/office/engine/idleActivities.ts';
import { OfficeState } from '../webview-ui/src/office/engine/officeState.ts';
import { PET_NAP_IDS, PET_TOY_IDS } from '../webview-ui/src/office/engine/petActivities.ts';
import {
  FURNITURE_CATEGORIES,
  getCatalogByCategory,
  getCatalogEntry,
  getRotatedType,
} from '../webview-ui/src/office/layout/furnitureCatalog.ts';
import {
  getBlockedTiles,
  layoutToSeats,
  layoutToTileMap,
} from '../webview-ui/src/office/layout/layoutSerializer.ts';
import { setPetTemplates } from '../webview-ui/src/office/sprites/petSpriteData.ts';
import type { OfficeLayout, Pet, PlacedFurniture } from '../webview-ui/src/office/types.ts';
import { TILE_SIZE, TileType } from '../webview-ui/src/office/types.ts';
import { ASSETS, Img, loadCatalog, renderOffice } from './preview/compose.ts';
import { encodeGif } from './preview/gif.mjs';

const FPS = 20;
const ROOM = 11;
const WALL_ROWS = 3;
/** Every activity a pet claims (the sofa nap id is 'sleep'). */
const PET_IDS = new Set<string>([...PET_TOY_IDS, ...PET_NAP_IDS, 'sleep']);

const args = process.argv.slice(2);
const opt = (name: string, dflt: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const OUT = path.resolve(opt('--out', 'preview-out/pets'));
const SECONDS = Number(opt('--sec', '10'));
const ONLY = opt('--only', '');

function views(type: string): string[] {
  const out = [type];
  for (let t = getRotatedType(type, 'cw'); t && t !== type; t = getRotatedType(t, 'cw'))
    out.push(t);
  return out;
}

function room(type: string, coat: boolean): { os: OfficeState; item: PlacedFurniture } {
  const entry = getCatalogEntry(type)!;
  const tiles = Array.from({ length: ROOM * ROOM }, (_, i) =>
    i < WALL_ROWS * ROOM ? TileType.WALL : TileType.FLOOR_1,
  );
  const col = Math.floor((ROOM - entry.footprintW) / 2);
  const item: PlacedFurniture = { uid: 'item', type, col, row: 5 };
  const pets = [
    {
      id: 'pet',
      petType: 0,
      ...(coat ? { appearance: { breed: 'marmalade' } } : {}),
    },
  ];
  const layout = {
    version: 1,
    cols: ROOM,
    rows: ROOM,
    tiles,
    furniture: [item],
    pets,
  } as unknown as OfficeLayout;
  return { os: new OfficeState(layout), item };
}

function petActivitiesAt(os: OfficeState): string[] {
  const layout = os.getLayout();
  const ctx = {
    furniture: layout.furniture,
    seats: layoutToSeats(layout.furniture),
    tileMap: layoutToTileMap(layout),
    blockedTiles: getBlockedTiles(layout.furniture),
  };
  return IDLE_ACTIVITIES.filter((d) => PET_IDS.has(d.id) && (d.spots?.(ctx).length ?? 0) > 0).map(
    (d) => d.id,
  );
}

function seed(s: number): void {
  Math.random = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** The item with a tile of floor around it and room above for a cat on top. */
function cropRect(item: PlacedFurniture) {
  const e = getCatalogEntry(item.type)!;
  const x = Math.max(0, (item.col - 2) * TILE_SIZE);
  const y = Math.max(0, item.row * TILE_SIZE - e.sprite.length - 8);
  const right = Math.min(ROOM * TILE_SIZE, (item.col + e.footprintW + 2) * TILE_SIZE);
  const bottom = Math.min(ROOM * TILE_SIZE, (item.row + e.footprintH + 1) * TILE_SIZE);
  return { x, y, w: right - x, h: bottom - y };
}

/** The pet doing `activity` at the item in view `type`: cropped frames. */
function record(type: string, activity: string, coat: boolean): Img[] {
  seed(11);
  const { os, item } = room(type, coat);
  const pet = os.pets[0] as Pet;
  pet.tileCol = 1;
  pet.tileRow = ROOM - 2;
  pet.x = pet.tileCol * TILE_SIZE + 8;
  pet.y = pet.tileRow * TILE_SIZE + 8;
  if (!os.forcePetActivity(pet.id, activity)) throw new Error(`${type}: cannot start ${activity}`);
  const dt = 1 / FPS;
  for (let i = 0; i < 4000 && !pet.careAnim; i++) os.update(dt);
  if (!pet.careAnim) throw new Error(`${type}: ${activity} never started`);
  const rect = cropRect(item);
  const frames: Img[] = [];
  for (let i = 0; i < SECONDS * FPS && pet.careAnim; i++) {
    const full = renderOffice(os, i * dt);
    const img = new Img(rect.w, rect.h);
    img.paste(full, -rect.x, -rect.y);
    frames.push(img);
    os.update(dt);
  }
  return frames;
}

/** Distinct consecutive frames (up to 30), 10 per row. */
function strip(frames: Img[]): Img {
  const uniq: Img[] = [];
  for (const f of frames)
    if (!uniq.length || Buffer.compare(f.data, uniq[uniq.length - 1].data) !== 0) uniq.push(f);
  const list = uniq.slice(0, 30);
  const per = Math.min(10, list.length);
  const { w, h } = list[0];
  const out = new Img(per * (w + 2), Math.ceil(list.length / per) * (h + 2));
  out.fill('#28282f');
  list.forEach((f, i) => out.paste(f, (i % per) * (w + 2), Math.floor(i / per) * (h + 2)));
  return out;
}

function sideBySide(a: Img[], b: Img[]): Img[] {
  return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => {
    const l = a[Math.min(i, a.length - 1)];
    const r = b[Math.min(i, b.length - 1)];
    const img = new Img(l.w + r.w + 2, l.h);
    img.fill('#28282f');
    img.paste(l, 0, 0);
    img.paste(r, l.w + 2, 0);
    return img;
  });
}

function main(): void {
  loadCatalog();
  const sheet = decodePetPng(fs.readFileSync(path.join(ASSETS, 'pets', 'gitcat', 'pet.png')));
  setPetTemplates([sheet as never], ['Gitcat'], ['cat']);
  fs.mkdirSync(OUT, { recursive: true });
  const types = FURNITURE_CATEGORIES.flatMap((c) => getCatalogByCategory(c.id).map((e) => e.type));
  let n = 0;
  for (const type of types) {
    for (const view of views(type)) {
      for (const activity of petActivitiesAt(room(view, false).os)) {
        if (ONLY && activity !== ONLY) continue;
        const frames = sideBySide(record(view, activity, false), record(view, activity, true));
        const base = path.join(OUT, `${view.replace(':', '-')}__${activity}`);
        strip(frames).writePng(`${base}.png`, 4);
        // Four frames spread over the play, large: the motion at a glance.
        const pick = [0.15, 0.35, 0.6, 0.85].map((k) => frames[Math.floor(frames.length * k)]);
        const row = new Img(
          pick.reduce((w, f) => w + f.w + 2, 0),
          pick[0].h,
        );
        row.fill('#28282f');
        pick.forEach((f, i) => row.paste(f, i * (f.w + 2), 0));
        row.writePng(`${base}-frames.png`, 5);
        fs.writeFileSync(`${base}.gif`, encodeGif(frames, 1000 / FPS, 4));
        console.log(`${view} ${activity}: ${frames.length} frames`);
        n++;
      }
    }
  }
  console.log(`${n} previews in ${OUT}`);
}

main();
