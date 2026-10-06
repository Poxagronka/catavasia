// The Cat CEO office furniture: an executive desk (48x32), a high-back
// leather executive chair (16x32: front, back, side) and a "CEO" wall plaque
// (16x32). MIT like the rest of the repo.
//
// Unlike the string templates of the beds and the coffee corner, these
// sprites are drawn with small primitives (rect, line, dots) into a char
// grid: the desk is too wide to keep readable as 48-char rows. One character
// is still one pixel of PALETTE.

import { ceoPlaque, chairBack, chairFront, chairSide } from './chairArt.mjs';
import { executiveDesk } from './deskArt.mjs';

export { PALETTE } from './canvas.mjs';

/**
 * Items for scripts/generate-executive-sprites.mjs. `members` is a rotation
 * group (orientation per member); otherwise the item is one asset.
 */
export const EXECUTIVE_ITEMS = [
  {
    id: 'EXECUTIVE_DESK',
    name: 'Executive Desk',
    category: 'desks',
    backgroundTiles: 1,
    rows: executiveDesk(),
  },
  {
    id: 'EXECUTIVE_CHAIR',
    name: 'Executive Chair',
    category: 'chairs',
    backgroundTiles: 1,
    rotationScheme: '3-way-mirror',
    members: [
      { orientation: 'front', rows: chairFront() },
      { orientation: 'back', rows: chairBack() },
      { orientation: 'side', rows: chairSide(), mirrorSide: true },
    ],
  },
  {
    id: 'CEO_PLAQUE',
    name: 'CEO Plaque',
    category: 'wall',
    canPlaceOnWalls: true,
    backgroundTiles: 0,
    rows: ceoPlaque(),
  },
];
