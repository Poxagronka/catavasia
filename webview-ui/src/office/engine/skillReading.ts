/**
 * Reading a skill: when an agent's tool is `Skill`, its cat walks to the
 * nearest bookshelf, reaches up, pulls a book out (the shelf shows the gap,
 * see shelfGap.ts), reads it facing the room (eyes move, a page flips), puts
 * it back and returns to its desk. It is a work activity: it runs while the
 * agent works and always plays to its end (at least SKILL_READ_MIN_SEC), even
 * for a short skill. With no reachable free shelf the cat reads at its desk.
 */

import { itemFrame } from '../layout/itemFrame.js';
import { isWalkable } from '../layout/tileMap.js';
import type { ActivitySpot } from '../types.js';
import { Direction } from '../types.js';
import type { AnimParts } from './activityAnim.js';
import { st } from './activityAnim.js';
import type { SpotContext } from './activitySpots.js';
import { itemsOfType } from './activitySpots.js';
import type { IdleActivityDef } from './idleActivities.js';
import { SHELF_TYPES } from './shelfGap.js';

/** Tool name that starts the scene (Claude's Skill tool). */
export const SKILL_TOOL = 'Skill';
/** Seconds the reading loop runs at least: one full loop always plays. */
export const SKILL_READ_MIN_SEC = 4;
/** Seconds a cat with no reachable shelf reads at its desk. */
export const DESK_READ_SEC = 6;

/** The book a cat takes is in the right column of the front view (shelfGap.ts GAPS: x 27-28). */
const BOOK_COL = 1;

const UP = Direction.UP;
const DOWN = Direction.DOWN;

const READ: AnimParts = {
  intro: [
    st('readReach', 0.4, { dir: UP }),
    st('readPull', 0.45, { dir: UP, item: 1 }),
    st('stand', 0.2, { dir: DOWN, item: 1 }),
  ],
  loop: [
    st('readHold', 0.9, { dir: DOWN, item: 1 }),
    st('readLookL', 0.5, { dir: DOWN, item: 1 }),
    st('readLookR', 0.5, { dir: DOWN, item: 1 }),
    st('readHold', 0.6, { dir: DOWN, item: 1 }),
    st('readFlip', 0.35, { dir: DOWN, item: 1, fx: 'page', fxAt: [10, 17] }),
    st('readHold', 0.7, { dir: DOWN, item: 1 }),
    st('readSmile', 0.6, { dir: DOWN, item: 1 }),
    st('readLookL', 0.45, { dir: DOWN, item: 1 }),
    st('readHold', 0.5, { dir: DOWN, item: 1 }),
  ],
  outro: [
    st('stand', 0.15, { dir: UP, item: 1 }),
    st('readPull', 0.4, { dir: UP, item: 1 }),
    st('readReach', 0.35, { dir: UP }),
    st('stand', 0.2, { dir: UP }),
  ],
};

/** The floor tile under each shelf's book, facing up at it. */
export function shelfSpots(ctx: SpotContext): ActivitySpot[] {
  const out: ActivitySpot[] = [];
  for (const item of itemsOfType(ctx, SHELF_TYPES)) {
    const { w, h, mirrored } = itemFrame(item.type);
    const col = item.col + (mirrored ? w - 1 - BOOK_COL : BOOK_COL);
    // Stand back far enough that the top shelf (and the gap) shows above the head.
    const row = item.row + Math.max(h, 2);
    if (!isWalkable(col, row, ctx.tileMap, ctx.blockedTiles)) continue;
    out.push({
      key: `${col},${row}`,
      col,
      row,
      facing: UP,
      onFurniture: false,
      itemUid: item.uid,
      offsetX: 0,
      offsetY: 0,
    });
  }
  return out;
}

export const SKILL_READ: IdleActivityDef = {
  id: 'skillRead',
  weight: 0,
  durationSec: [SKILL_READ_MIN_SEC, SKILL_READ_MIN_SEC],
  ...READ,
  spots: shelfSpots,
  work: true,
};
