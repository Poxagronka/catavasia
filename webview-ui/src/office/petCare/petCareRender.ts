import {
  CARE_CLEANUP_FX_SEC,
  LITTER_FLY_COUNT,
  PET_BOWL_MAX,
  PET_HEART_LIFE_SEC,
  PET_HEART_RISE_PX,
  PET_REQUEST_BOB_PERIOD_SEC,
  PET_REQUEST_BOB_PX,
  PET_SPARKLE_SEC,
  POOP_GRIMACE_SEC,
} from '../../constants.js';
import type { FxDrawable } from '../engine/activityFx.js';
import { fxDrawables } from '../engine/activityFx.js';
import { furnitureKind, getCatalogEntry } from '../layout/furnitureCatalog.js';
import { itemFrame } from '../layout/itemFrame.js';
import {
  BAG_FRAMES,
  bowlSprite,
  DISH_SPRITE,
  FLY_FRAMES,
  HAND_FRAMES,
  HEART_SPRITE,
  litterBoxSprite,
  litterFrontSprite,
  POOP_SPRITE,
  POUR_FRAMES,
  REQUEST_BUBBLES,
  SCOOP_FRAMES,
  SPARKLE_FRAMES,
  STINK_FRAMES,
  YARN_FRAMES,
} from '../sprites/petCareSprites.js';
import { getCachedSprite } from '../sprites/spriteCache.js';
import type { FurnitureInstance, Pet, PlacedFurniture, SpriteData } from '../types.js';
import { Direction, TILE_SIZE } from '../types.js';
import { isLitterBoxType, sandStage } from './litterStages.js';
import { PET_BOWL_TYPE } from './petCareNav.js';
import type { PetCareSystem } from './petCareSystem.js';
import type { Effect } from './petCareTypes.js';

/** Frame length of the small looping overlays (stink, hand, yarn). */
const OVERLAY_FRAME_SEC = 0.3;
/** Stink line opacity. */
const STINK_ALPHA = 0.8;
/** Pixel offset of a floor poop inside its tile. */
const POOP_OFFSET = { x: 4, y: 1 };

function frameAt<T>(frames: T[], t: number): T {
  return frames[Math.floor(t / OVERLAY_FRAME_SEC) % frames.length];
}

/**
 * Furniture list for this frame: bowls and litter boxes swapped to their fill
 * state, plus floor poops, treat dishes and yarn balls as z-sorted extras.
 * Returns a new array; the OfficeState list is left untouched.
 */
export function decorateFurniture(
  instances: FurnitureInstance[],
  placed: PlacedFurniture[],
  care: PetCareSystem,
  pets: Pet[],
  time: number,
): FurnitureInstance[] {
  // Match by tile AND by the catalog sprite: another item may share a litter
  // box tile (its tile is a background row), and it must keep its own sprite.
  const swap = new Map<string, { from: SpriteData; to: SpriteData }>();
  const fronts: FurnitureInstance[] = [];
  for (const f of placed) {
    const from = getCatalogEntry(f.type)?.sprite;
    if (!from) continue;
    if (furnitureKind(f.type) === PET_BOWL_TYPE) {
      const b = care.world.bowl(f.uid);
      swap.set(`${f.col},${f.row}`, { from, to: bowlSprite(b.food, b.water, PET_BOWL_MAX) });
    } else if (isLitterBoxType(f.type)) {
      const w = care.world;
      const to = litterBoxSprite(f.type, w.boxCount(f.uid), sandStage(w.litterUses(f.uid)));
      if (!to) continue;
      swap.set(`${f.col},${f.row}:box`, { from, to });
      // The front wall once more, just in front of a cat on the tile: it stands IN the box.
      fronts.push({
        sprite: litterFrontSprite(f.type, to),
        x: f.col * TILE_SIZE,
        y: f.row * TILE_SIZE,
        zY: (f.row + 1) * TILE_SIZE + 1,
        ...(itemFrame(f.type).mirrored ? { mirrored: true } : {}),
      });
    }
  }
  const out = instances.map((inst) => {
    const key = `${inst.x / TILE_SIZE},${inst.y / TILE_SIZE}`;
    for (const k of [key, `${key}:box`]) {
      const hit = swap.get(k);
      if (hit && hit.from === inst.sprite) return { ...inst, sprite: hit.to };
    }
    return inst;
  });
  out.push(...fronts);
  for (const p of care.world.floorPoops) {
    const x = p.col * TILE_SIZE + POOP_OFFSET.x;
    const y = p.row * TILE_SIZE + POOP_OFFSET.y;
    out.push({ sprite: POOP_SPRITE, x, y, zY: p.row * TILE_SIZE + POOP_OFFSET.y });
  }
  for (const pet of pets) {
    const front = pet.y + TILE_SIZE / 2;
    if (care.hasDish(pet.id)) {
      const dx = pet.dir === Direction.LEFT ? -9 : pet.dir === Direction.RIGHT ? 2 : -3;
      out.push({ sprite: DISH_SPRITE, x: pet.x + dx, y: pet.y - 5, zY: front + 0.1 });
    }
    if (pet.careAnim?.kind === 'play') {
      const dx = pet.dir === Direction.LEFT ? -14 : 9;
      out.push({
        sprite: frameAt(YARN_FRAMES, time),
        x: pet.x + dx,
        y: pet.y - 4,
        zY: front + 0.1,
      });
    }
  }
  return out;
}

function draw(
  ctx: CanvasRenderingContext2D,
  sprite: SpriteData,
  wx: number,
  wy: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
  alpha = 1,
): void {
  const cached = getCachedSprite(sprite, zoom);
  const x = Math.round(offsetX + wx * zoom);
  const y = Math.round(offsetY + wy * zoom);
  if (alpha >= 1) {
    ctx.drawImage(cached, x, y);
    return;
  }
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.drawImage(cached, x, y);
  ctx.restore();
}

/**
 * Overlays drawn above the scene: stink over poops and full boxes, the
 * petting hand, request bubbles, floating hearts and sparkles.
 */
export function renderPetCareOverlay(
  ctx: CanvasRenderingContext2D,
  care: PetCareSystem,
  pets: Pet[],
  placed: PlacedFurniture[],
  offsetX: number,
  offsetY: number,
  zoom: number,
  time: number,
): void {
  const stink = frameAt(STINK_FRAMES, time);
  const stinkW = stink[0].length;
  const stinkAt = (col: number, worldY: number) =>
    draw(
      ctx,
      stink,
      col * TILE_SIZE + (TILE_SIZE - stinkW) / 2,
      worldY,
      offsetX,
      offsetY,
      zoom,
      STINK_ALPHA,
    );
  // Stink rises from just above the pile / a full box; flies circle a pile and an overflowing box.
  const flies = (cx: number, cy: number, seed: number) => {
    for (let i = 0; i < LITTER_FLY_COUNT; i++) {
      const a = time * (2.2 + i * 0.5) + seed + (i * Math.PI * 2) / LITTER_FLY_COUNT;
      const fx = cx + Math.cos(a) * (4 + i) - 1;
      const fy = cy + Math.sin(a * 2) * 2.5 - i;
      const frame = FLY_FRAMES[Math.floor(time * 18 + i) % FLY_FRAMES.length];
      draw(ctx, frame, fx, fy, offsetX, offsetY, zoom, 0.9);
    }
  };
  for (const p of care.world.floorPoops) {
    stinkAt(p.col, p.row * TILE_SIZE + POOP_OFFSET.y - 6);
    flies(p.col * TILE_SIZE + TILE_SIZE / 2, p.row * TILE_SIZE - 1, p.col * 1.7 + p.row);
  }
  for (const f of placed) {
    if (!isLitterBoxType(f.type) || !care.world.isBoxFull(f.uid)) continue;
    stinkAt(f.col, f.row * TILE_SIZE - 1);
    if (care.world.isBoxRefused(f.uid)) {
      flies(f.col * TILE_SIZE + TILE_SIZE / 2, f.row * TILE_SIZE + 1, f.col * 1.3 + f.row);
    }
  }

  // A request bubble waits until the cat's hearts have floated away.
  const hearted = new Set(care.effects.filter((e) => e.petId).map((e) => e.petId));
  for (const pet of pets) {
    // Same anchor as the pet heart bubble: centered, one tile above the feet.
    const headY = pet.y - TILE_SIZE;
    for (const fx of petCareFx(pet, time)) {
      draw(ctx, fx.sprite, fx.x, fx.y, offsetX, offsetY, zoom, fx.alpha);
    }
    if (pet.careAnim?.kind === 'petted') {
      const hand = frameAt(HAND_FRAMES, time);
      draw(ctx, hand, pet.x - hand[0].length / 2, headY - 2, offsetX, offsetY, zoom);
      continue;
    }
    const request = care.requestOf(pet.id);
    if (!request || pet.careAnim || pet.bubbleType || hearted.has(pet.id)) continue;
    const bubble = REQUEST_BUBBLES[request];
    const bob =
      Math.sin((time / PET_REQUEST_BOB_PERIOD_SEC) * Math.PI * 2) > 0 ? PET_REQUEST_BOB_PX : 0;
    const x = pet.x - bubble[0].length / 2;
    draw(ctx, bubble, x, headY - bubble.length - 1 - bob, offsetX, offsetY, zoom);
  }

  for (const e of care.effects) {
    if (e.age < 0) continue;
    if (e.kind === 'heart' && e.age < PET_HEART_LIFE_SEC) {
      const k = e.age / PET_HEART_LIFE_SEC;
      const w = HEART_SPRITE[0].length;
      draw(
        ctx,
        HEART_SPRITE,
        e.x - w / 2,
        e.y - 8 - k * PET_HEART_RISE_PX,
        offsetX,
        offsetY,
        zoom,
        1 - k * k,
      );
    } else if (e.kind === 'scoop' || e.kind === 'bag' || e.kind === 'pour' || e.kind === 'glint') {
      const tool = careToolFrame(e);
      if (tool) draw(ctx, tool.sprite, tool.x, tool.y, offsetX, offsetY, zoom, tool.alpha);
    } else if (e.kind === 'sparkle' && e.age < PET_SPARKLE_SEC) {
      const frames = SPARKLE_FRAMES;
      const s =
        frames[Math.min(frames.length - 1, Math.floor((e.age / PET_SPARKLE_SEC) * frames.length))];
      for (const [dx, dy] of [
        [-6, -10],
        [3, -6],
        [-1, -14],
      ]) {
        draw(ctx, s, e.x + dx, e.y + dy, offsetX, offsetY, zoom);
      }
    }
  }
}

/**
 * Small effects of a care pose: crumbs while it crunches, ripples while it
 * laps, litter flying while it digs, hearts while it purrs under the hand.
 */
export function petCareFx(pet: Pet, time: number): FxDrawable[] {
  const face = pet.grimaceSec
    ? fxDrawables(
        'grimace',
        { x: pet.x, y: pet.y - TILE_SIZE + 2, mirror: false, zY: pet.y + TILE_SIZE + 1 },
        POOP_GRIMACE_SEC - pet.grimaceSec,
      )
    : [];
  // Speed lines behind a pet on a sideways zoomies dash.
  const side = pet.dir === Direction.LEFT || pet.dir === Direction.RIGHT;
  const dash =
    pet.sprint && side
      ? fxDrawables(
          'speed',
          { x: pet.x, y: pet.y + 4, mirror: pet.dir === Direction.LEFT, zY: pet.y + TILE_SIZE },
          pet.x / 20,
        )
      : [];
  return [...face, ...dash, ...careAnimFx(pet, time)];
}

function careAnimFx(pet: Pet, time: number): FxDrawable[] {
  const kind = pet.careAnim?.kind;
  const ahead = pet.dir === Direction.LEFT ? -1 : 1;
  const side = pet.dir === Direction.LEFT || pet.dir === Direction.RIGHT;
  const at = (dx: number, dy: number) => ({
    x: pet.x + dx,
    y: pet.y + dy,
    mirror: pet.dir === Direction.LEFT,
    zY: pet.y + TILE_SIZE,
  });
  switch (kind) {
    case 'eat':
      return fxDrawables('crumbs', at(side ? ahead * 6 : 0, -2), time);
    case 'drink':
      return fxDrawables('ripple', at(side ? ahead * 7 : 0, 0), time);
    case 'poop': {
      // The poop frames (petCareFrames.ts): dig 0-3, squat 4-7, cover 8-11, proud 12+.
      const f = pet.careAnim?.frame ?? 0;
      if (f >= 4 && f < 8) return fxDrawables('effort', at(ahead * 3, -TILE_SIZE + 4), time);
      if (f >= 12) return [];
      // Sand flies back from the rear while digging, forward while covering.
      const back = f < 4 ? -1 : 1;
      return fxDrawables(
        'sand',
        {
          ...at(side ? -ahead * 5 * back : 0, -2),
          mirror: (pet.dir === Direction.LEFT) !== back > 0,
        },
        time,
      );
    }
    case 'grimace':
      return [];
    case 'petted':
      return fxDrawables('hearts', at(0, -TILE_SIZE + 2), time);
    default:
      return [];
  }
}

/**
 * The clean-up tool of a care effect at its age: the litter scoop sifting a
 * box, the poop bag coming down over a pile and lifting it away, a bag of
 * fresh litter pouring in, and glints on new litter. World px, top-left.
 */
export function careToolFrame(
  e: Effect,
): { sprite: SpriteData; x: number; y: number; alpha: number } | null {
  const k = Math.min(1, e.age / CARE_CLEANUP_FX_SEC);
  const fadeOut = k > 0.8 ? (1 - k) / 0.2 : 1;
  switch (e.kind) {
    case 'scoop': {
      // Down into the box, sift (a jiggle), lift the clump out and away.
      const i = k < 0.2 ? 0 : k < 0.5 ? 1 : 2;
      const drop = k < 0.2 ? Math.round(((0.2 - k) / 0.2) * 8) : 0;
      const jiggle = i === 1 ? Math.round(Math.sin(e.age * 40)) : 0;
      const lift = k > 0.5 ? Math.round(((k - 0.5) / 0.5) * 14) : 0;
      return {
        sprite: SCOOP_FRAMES[i],
        x: e.x - 5 + jiggle,
        y: e.y - 8 - drop - lift,
        alpha: fadeOut,
      };
    }
    case 'bag': {
      // Down over the pile, the pile goes in (BAG_PICKUP_SEC), tied and lifted away.
      const i = k < 0.2 ? 0 : k < 0.42 ? 1 : 2;
      const drop = k < 0.2 ? Math.round(((0.2 - k) / 0.2) * 10) : 0;
      const lift = k > 0.45 ? Math.round(((k - 0.45) / 0.55) * 16) : 0;
      return { sprite: BAG_FRAMES[i], x: e.x - 4, y: e.y - 6 - drop - lift, alpha: fadeOut };
    }
    case 'pour': {
      // Tipped in from above, pouring, then lifted away.
      const frame = POUR_FRAMES[Math.floor(e.age / 0.1) % POUR_FRAMES.length];
      const drop = k < 0.15 ? Math.round(((0.15 - k) / 0.15) * 6) : 0;
      const lift = k > 0.75 ? Math.round(((k - 0.75) / 0.25) * 8) : 0;
      return { sprite: frame, x: e.x - 4, y: e.y - 14 - drop - lift, alpha: fadeOut };
    }
    case 'glint': {
      // Glints hop over the fresh sand: a twinkle (small, big, small) at a new place each time.
      const life = e.life ?? 1;
      const step = Math.floor(e.age / 0.45);
      const phase = (e.age % 0.45) / 0.45;
      if (e.age > life || phase > 0.75) return null;
      const spark = SPARKLE_FRAMES[phase < 0.25 ? 0 : phase < 0.5 ? 1 : 0];
      const dx = ((step * 5) % 11) - 5;
      const dy = (step * 2) % 3;
      return { sprite: spark, x: e.x + dx - 2, y: e.y + dy - 4, alpha: 1 - (e.age / life) * 0.5 };
    }
    default:
      return null;
  }
}
