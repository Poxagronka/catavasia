import {
  LITTER_SPOT_OFFSET_Y,
  PET_LITTER_CAPACITY,
  PET_LITTER_DIRTY_AFTER,
  PET_LITTER_FULL,
  PET_LITTER_USED_AFTER,
} from '../../constants.js';
import { furnitureKind } from '../layout/furnitureCatalog.js';
import { itemFrame, spriteX } from '../layout/itemFrame.js';
import { isHoodedLitterBox } from '../sprites/petCareSprites.js';
import type { HousePeek, PlacedFurniture } from '../types.js';
import { TILE_SIZE } from '../types.js';

/**
 * Litter box fill stages, from the pile count:
 * clean (0) → one pile (1) → a few (2-3) → full, with stink lines (4) →
 * flies (5, the capacity): every cat grimaces and refuses the box.
 * Pure: shared by the pet-care world, the renderer, the menus and tests.
 */
export type LitterStage = 'clean' | 'one' | 'few' | 'full' | 'flies';

export function litterStage(piles: number): LitterStage {
  if (piles <= 0) return 'clean';
  if (piles === 1) return 'one';
  if (piles < PET_LITTER_FULL) return 'few';
  return piles < PET_LITTER_CAPACITY ? 'full' : 'flies';
}

export const LITTER_STAGE_LABELS: Record<LitterStage, string> = {
  clean: 'Clean',
  one: 'One pile',
  few: 'A few piles',
  full: 'Full, it smells',
  flies: 'Flies! Cats refuse it',
};

/** Sand look from uses since the last litter change: 0 fresh, 1 used, 2 dirty. */
export function sandStage(uses: number): 0 | 1 | 2 {
  if (uses < PET_LITTER_USED_AFTER) return 0;
  return uses < PET_LITTER_DIRTY_AFTER ? 1 : 2;
}

/** Litter freshness for the Info panel: 100 just changed, 0 at the dirty mark. */
export function litterFreshness(uses: number): number {
  return Math.max(0, Math.round(100 * (1 - uses / PET_LITTER_DIRTY_AFTER)));
}

/** Every litter box variant: LITTER_BOX (open tray) and LITTER_BOX_<variant>. */
export function isLitterBoxType(type: string): boolean {
  const kind = furnitureKind(type);
  return kind === 'LITTER_BOX' || kind.startsWith('LITTER_BOX_');
}

/** Where the face of a cat inside a hooded box looks out: the door's foot (front-view sprite px). */
const HOOD_DOOR = { x: 8, y: 11 };

/**
 * How a cat sits in a box: drawn LITTER_SPOT_OFFSET_Y px lower in an open
 * box (its front wall hides the paws), hidden in a hooded one: it turns
 * round inside and only its face (ears, shining eyes) shows in the door.
 */
export function boxPose(box: PlacedFurniture): { offsetY: number; peek?: HousePeek } {
  if (!isHoodedLitterBox(box.type)) return { offsetY: LITTER_SPOT_OFFSET_Y };
  const frame = itemFrame(box.type);
  const peek: HousePeek = {
    kind: 'face',
    x: box.col * TILE_SIZE + spriteX(frame, HOOD_DOOR.x),
    y: box.row * TILE_SIZE + HOOD_DOOR.y,
    zY: (box.row + 1) * TILE_SIZE + 1.5, // furniture sorts at +0, the front wall at +1
    ...(frame.mirrored ? { mirrored: true } : {}),
  };
  return { offsetY: 0, peek };
}
