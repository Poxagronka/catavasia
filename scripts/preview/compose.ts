// Preview compositor: draws an OfficeState into an RGBA buffer the way
// renderer.ts draws the scene (floor, furniture and cats z-sorted, bottom-centre
// anchors, activity offsets, house peeks, activity effects). Not shipped:
// it backs scripts/preview-furniture.ts (docs/catavasia/furniture.md).
import fs from 'node:fs';
import path from 'node:path';

import { PNG } from 'pngjs';

import { buildFurnitureCatalog } from '../../core/src/assets/build.ts';
import { characterFx } from '../../webview-ui/src/office/engine/activityFx.ts';
import {
  characterDrawOffsetX,
  characterDrawOffsetY,
  getCharacterSprite,
  peekNow,
} from '../../webview-ui/src/office/engine/characters.ts';
import { peekSprite, peekTwitch } from '../../webview-ui/src/office/engine/housePeek.ts';
import type { OfficeState } from '../../webview-ui/src/office/engine/officeState.ts';
import { isHiddenInRunThrough } from '../../webview-ui/src/office/engine/runThrough.ts';
import { socialSpriteFor } from '../../webview-ui/src/office/engine/socialRender.ts';
import { buildDynamicCatalog } from '../../webview-ui/src/office/layout/furnitureCatalog.ts';
import { decorateFurniture } from '../../webview-ui/src/office/petCare/petCareRender.ts';
import { furColorOf } from '../../webview-ui/src/office/sprites/socialSprites.ts';
import { getCharacterSprites } from '../../webview-ui/src/office/sprites/spriteData.ts';
import type { SpriteData } from '../../webview-ui/src/office/types.ts';
import { TILE_SIZE, TileType } from '../../webview-ui/src/office/types.ts';

export const ASSETS = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  'webview-ui',
  'public',
  'assets',
);

function readSprite(file: string): SpriteData {
  const png = PNG.sync.read(fs.readFileSync(file));
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  const out: SpriteData = [];
  for (let y = 0; y < png.height; y++) {
    const row: string[] = [];
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const a = png.data[i + 3];
      row.push(
        a === 0
          ? ''
          : `#${hex(png.data[i])}${hex(png.data[i + 1])}${hex(png.data[i + 2])}${a < 255 ? hex(a) : ''}`,
      );
    }
    out.push(row);
  }
  return out;
}

/** Build the furniture catalog from the assets on disk (once). */
export function loadCatalog(): void {
  const catalog = buildFurnitureCatalog(ASSETS);
  const sprites: Record<string, SpriteData> = {};
  for (const c of catalog) sprites[c.id] = readSprite(path.join(ASSETS, c.furniturePath));
  buildDynamicCatalog({ catalog, sprites } as never);
}

export class Img {
  data: Uint8Array;
  constructor(
    public w: number,
    public h: number,
  ) {
    this.data = new Uint8Array(w * h * 4);
  }

  put(x: number, y: number, hex: string, alpha = 1): void {
    if (!hex || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const n = parseInt(hex.slice(1, 7), 16);
    const a = (hex.length > 7 ? parseInt(hex.slice(7, 9), 16) / 255 : 1) * alpha;
    const i = (y * this.w + x) * 4;
    const mix = (o: number, v: number) => Math.round(o * (1 - a) + v * a);
    this.data[i] = mix(this.data[i], n >> 16);
    this.data[i + 1] = mix(this.data[i + 1], (n >> 8) & 255);
    this.data[i + 2] = mix(this.data[i + 2], n & 255);
    this.data[i + 3] = 255;
  }

  sprite(s: SpriteData, x0: number, y0: number, mirror = false, alpha = 1): void {
    const w = s[0]?.length ?? 0;
    s.forEach((row, y) =>
      row.forEach((px, x) => this.put(x0 + (mirror ? w - 1 - x : x), y0 + y, px, alpha)),
    );
  }

  /** Copy `src` into this image at (x, y). */
  paste(src: Img, x0: number, y0: number): void {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const X = x0 + x;
        const Y = y0 + y;
        if (X < 0 || Y < 0 || X >= this.w || Y >= this.h) continue;
        const s = (y * src.w + x) * 4;
        this.data.set(src.data.subarray(s, s + 4), (Y * this.w + X) * 4);
      }
  }

  fill(hex: string): void {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.put(x, y, hex);
  }

  writePng(file: string, scale = 1): void {
    const png = new PNG({ width: this.w * scale, height: this.h * scale });
    for (let y = 0; y < this.h * scale; y++)
      for (let x = 0; x < this.w * scale; x++) {
        const s = (Math.floor(y / scale) * this.w + Math.floor(x / scale)) * 4;
        png.data.set(this.data.subarray(s, s + 4), (y * this.w * scale + x) * 4);
      }
    fs.writeFileSync(file, PNG.sync.write(png));
  }
}

const FLOOR_A = '#c9b79c';
const FLOOR_B = '#c2b095';
const WALL = '#6b5a64';

/** The whole office at time `nowSec`, 1 px per sprite px. */
export function renderOffice(os: OfficeState, nowSec: number): Img {
  const { cols, rows } = os.layout;
  const img = new Img(cols * TILE_SIZE, rows * TILE_SIZE);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const t = os.tileMap[r][c];
      if (t === TileType.VOID) continue;
      const color = t === TileType.WALL ? WALL : (r + c) % 2 ? FLOOR_A : FLOOR_B;
      for (let y = 0; y < TILE_SIZE; y++)
        for (let x = 0; x < TILE_SIZE; x++) img.put(c * TILE_SIZE + x, r * TILE_SIZE + y, color);
    }
  const draws: Array<{ zY: number; draw: () => void }> = [];
  const placed = os.getLayout().furniture;
  const furniture = os.getFurnitureForRender(nowSec);
  for (const f of decorateFurniture(furniture, placed, os.petCare, os.pets, nowSec))
    draws.push({ zY: f.zY, draw: () => img.sprite(f.sprite, f.x, f.y, !!f.mirrored) });
  for (const ch of os.characters.values()) {
    for (const d of characterFx(ch))
      draws.push({ zY: d.zY, draw: () => img.sprite(d.sprite, d.x, d.y, false, d.alpha ?? 1) });
    const peek = peekNow(ch);
    if (peek) {
      const s = peekSprite(peek.kind, furColorOf(ch), peekTwitch(ch), peek.mirrored);
      const x = peek.x - Math.floor(s[0].length / 2);
      draws.push({ zY: peek.zY, draw: () => img.sprite(s, x, peek.y - s.length) });
      continue;
    }
    if (isHiddenInRunThrough(ch)) continue;
    const sprites = ch.customSprites ?? getCharacterSprites(ch.palette, ch.hueShift);
    const s = socialSpriteFor(ch, getCharacterSprite(ch, sprites), sprites);
    if (!s) continue;
    const x = Math.round(ch.x + characterDrawOffsetX(ch) - s[0].length / 2);
    const y = Math.round(ch.y + characterDrawOffsetY(ch) - s.length);
    draws.push({ zY: ch.y + TILE_SIZE / 2 + 0.5, draw: () => img.sprite(s, x, y) });
  }
  draws.sort((a, b) => a.zY - b.zY);
  for (const d of draws) d.draw();
  return img;
}
