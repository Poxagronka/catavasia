/**
 * How a placed item is turned: which view the editor's R put it in, and
 * whether its sprite is drawn mirrored. Spot builders declare spots in the
 * item's FRONT view (item-local sides and sprite px) and resolve them here,
 * so a cat finds the same place on the item however it is turned.
 * Rule and mechanism: docs/catavasia/furniture.md.
 */

import type { Direction as DirectionT } from '../types.js';
import { Direction, TILE_SIZE } from '../types.js';
import { furnitureKind, getCatalogEntry } from './furnitureCatalog.js';

/** Where the item's front points: front = toward the viewer (down). */
export type ItemView = 'front' | 'right' | 'back' | 'left';

/** A side of the item as seen in its front view ('left' = the viewer's left). */
export type ItemSide = 'front' | 'back' | 'left' | 'right';

export interface ItemFrame {
  /** Manifest id: the same for every view, state and animation frame. */
  kind: string;
  view: ItemView;
  /** The sprite is drawn flipped (the `:left` of a side view, or a mirror-scheme item). */
  mirrored: boolean;
  /** Footprint in tiles. */
  w: number;
  h: number;
}

export function itemFrame(type: string): ItemFrame {
  const entry = getCatalogEntry(type);
  const o = entry?.orientation;
  const view: ItemView =
    o === 'back'
      ? 'back'
      : o === 'side' || o === 'right'
        ? 'right'
        : o === 'left'
          ? 'left'
          : 'front';
  return {
    kind: furnitureKind(type),
    view,
    mirrored: !!entry?.mirrorSide && type.endsWith(':left'),
    w: entry?.footprintW ?? 1,
    h: entry?.footprintH ?? 1,
  };
}

const { UP, DOWN, LEFT, RIGHT } = Direction;

/** Screen direction of each item-local side, per view (the item turns about its centre). */
const TURN: Record<ItemView, Record<ItemSide, DirectionT>> = {
  front: { front: DOWN, back: UP, left: LEFT, right: RIGHT },
  right: { front: RIGHT, back: LEFT, left: DOWN, right: UP },
  back: { front: UP, back: DOWN, left: RIGHT, right: LEFT },
  left: { front: LEFT, back: RIGHT, left: UP, right: DOWN },
};

const SWAP: Record<ItemSide, ItemSide> = {
  front: 'front',
  back: 'back',
  left: 'right',
  right: 'left',
};

/**
 * The screen direction an item-local side points in. A mirror image (a
 * mirror-scheme item) swaps left and right; a turned view rotates every side.
 */
export function sideDirection(frame: ItemFrame, side: ItemSide): DirectionT {
  const mirrorImage = frame.mirrored && (frame.view === 'front' || frame.view === 'back');
  return TURN[frame.view][mirrorImage ? SWAP[side] : side];
}

/** A sprite px column of the unflipped art, where it lands on screen (0 = sprite left). */
export function spriteX(frame: ItemFrame, x: number): number {
  return frame.mirrored ? frame.w * TILE_SIZE - x : x;
}

/** The art view whose numbers apply: the right view's art is the left view's, mirrored. */
export function artView(frame: ItemFrame): 'front' | 'side' | 'back' {
  return frame.view === 'front' ? 'front' : frame.view === 'back' ? 'back' : 'side';
}

/** LEFT ↔ RIGHT; UP and DOWN stay. */
export function mirrorDirection(dir: DirectionT): DirectionT {
  return dir === LEFT ? RIGHT : dir === RIGHT ? LEFT : dir;
}
