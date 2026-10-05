import {
  PET_BOWL_MAX,
  PET_HEART_LIFE_SEC,
  PET_HEART_RISE_PX,
  PET_LITTER_CAPACITY,
  PET_REQUEST_BOB_PERIOD_SEC,
  PET_REQUEST_BOB_PX,
  PET_SPARKLE_SEC,
} from '../../constants.js';
import {
  bowlSprite,
  DISH_SPRITE,
  HAND_FRAMES,
  HEART_SPRITE,
  litterSprite,
  POOP_SPRITE,
  REQUEST_BUBBLES,
  SPARKLE_FRAMES,
  STINK_FRAMES,
  YARN_FRAMES,
} from '../sprites/petCareSprites.js';
import { getCachedSprite } from '../sprites/spriteCache.js';
import type { FurnitureInstance, Pet, PlacedFurniture, SpriteData } from '../types.js';
import { Direction, TILE_SIZE } from '../types.js';
import { LITTER_BOX_TYPE, PET_BOWL_TYPE } from './petCareNav.js';
import type { PetCareSystem } from './petCareSystem.js';

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
  const swap = new Map<string, SpriteData>();
  for (const f of placed) {
    if (f.type === PET_BOWL_TYPE) {
      const b = care.world.bowl(f.uid);
      swap.set(`${f.col},${f.row}`, bowlSprite(b.food, b.water, PET_BOWL_MAX));
    } else if (f.type === LITTER_BOX_TYPE) {
      swap.set(`${f.col},${f.row}`, litterSprite(care.world.boxCount(f.uid), PET_LITTER_CAPACITY));
    }
  }
  const out = instances.map((inst) => {
    if (inst.sprite.length !== TILE_SIZE) return inst;
    const sprite = swap.get(`${inst.x / TILE_SIZE},${inst.y / TILE_SIZE}`);
    return sprite ? { ...inst, sprite } : inst;
  });
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
  // Stink rises from just above the pile / the box contents.
  for (const p of care.world.floorPoops) stinkAt(p.col, p.row * TILE_SIZE + POOP_OFFSET.y - 6);
  for (const f of placed) {
    if (f.type !== LITTER_BOX_TYPE || !care.world.isBoxFull(f.uid)) continue;
    stinkAt(f.col, f.row * TILE_SIZE - 1);
  }

  // A request bubble waits until the cat's hearts have floated away.
  const hearted = new Set(care.effects.filter((e) => e.petId).map((e) => e.petId));
  for (const pet of pets) {
    // Same anchor as the pet heart bubble: centered, one tile above the feet.
    const headY = pet.y - TILE_SIZE;
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
