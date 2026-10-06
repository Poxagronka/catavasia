/**
 * The Tasks whiteboard: any WHITEBOARD on the wall opens the Tasks panel on
 * click, and shows the live task state as three sticky notes (running,
 * waiting, done), each with its count. The note area matches the board art
 * (scripts/executive/whiteboardArt.mjs: x 3..28, y 12..20).
 *
 * DOM-free: OfficeCanvas does the click, OfficeState draws the notes.
 */

import type { TaskSummary } from '../../../../core/src/tasks.js';
import {
  WHITEBOARD_INK as INK,
  WHITEBOARD_NOTE_COLORS,
  WHITEBOARD_NOTE_SHADOW as SHADOW,
} from '../../constants.js';
import { furnitureKind, getCatalogEntry } from '../layout/furnitureCatalog.js';
import type { PlacedFurniture, SpriteData } from '../types.js';
import { TILE_SIZE } from '../types.js';

export const WHITEBOARD_TYPE = 'WHITEBOARD';

/**
 * Tasks per board status. `waiting` = a team task the server stopped
 * (`interrupted`): it waits for the user to resume or cancel it.
 */
export interface TaskCounts {
  running: number;
  waiting: number;
  done: number;
}

export function countTasks(tasks: ReadonlyArray<Pick<TaskSummary, 'status' | 'flow'>>): TaskCounts {
  const counts: TaskCounts = { running: 0, waiting: 0, done: 0 };
  for (const t of tasks) {
    if (t.status === 'running') counts.running++;
    else if (t.status === 'done') counts.done++;
    else if (t.flow?.state === 'interrupted') counts.waiting++;
  }
  return counts;
}

/** Hover text of the board: the title, then the counts. */
export function whiteboardTooltip(counts: TaskCounts | null): string[] {
  if (!counts) return ['Tasks'];
  return ['Tasks', `${counts.running} running · ${counts.waiting} waiting · ${counts.done} done`];
}

/** The whiteboard under a world point, or undefined. */
export function whiteboardAt(
  worldX: number,
  worldY: number,
  furniture: readonly PlacedFurniture[],
): PlacedFurniture | undefined {
  return furniture.find((f) => {
    if (furnitureKind(f.type) !== WHITEBOARD_TYPE) return false;
    const entry = getCatalogEntry(f.type);
    const w = (entry?.footprintW ?? 2) * TILE_SIZE;
    const h = (entry?.footprintH ?? 2) * TILE_SIZE;
    const x = f.col * TILE_SIZE;
    const y = f.row * TILE_SIZE;
    return worldX >= x && worldX < x + w && worldY >= y && worldY < y + h;
  });
}

// ── Sticky notes ─────────────────────────────────────────────────────────

const NOTE_W = 7;
const NOTE_H = 8;
const NOTE_Y = 12;
/** Left edge of each note, in board order. */
const NOTES: Array<{ key: keyof TaskCounts; x: number }> = [
  { key: 'running', x: 3 },
  { key: 'waiting', x: 12 },
  { key: 'done', x: 21 },
];

/** 3x5 digits, '#' = ink. */
const DIGITS = [
  ['###', '#.#', '#.#', '#.#', '###'],
  ['.#.', '##.', '.#.', '.#.', '###'],
  ['###', '..#', '###', '#..', '###'],
  ['###', '..#', '.##', '..#', '###'],
  ['#.#', '#.#', '###', '..#', '..#'],
  ['###', '#..', '###', '..#', '###'],
  ['###', '#..', '###', '#.#', '###'],
  ['###', '..#', '.#.', '.#.', '.#.'],
  ['###', '#.#', '###', '#.#', '###'],
  ['###', '#.#', '###', '..#', '###'],
];

function drawDigit(out: SpriteData, digit: number, x: number, y: number): void {
  DIGITS[digit].forEach((row, dy) =>
    [...row].forEach((ch, dx) => {
      if (ch === '#' && out[y + dy]?.[x + dx] !== undefined) out[y + dy][x + dx] = INK;
    }),
  );
}

function drawNote(out: SpriteData, x: number, paper: string, strip: string, count: number): void {
  const set = (px: number, py: number, color: string) => {
    if (out[py]?.[px] !== undefined) out[py][px] = color;
  };
  for (let dy = 0; dy < NOTE_H; dy++)
    for (let dx = 0; dx < NOTE_W; dx++) set(x + dx, NOTE_Y + dy, dy === 0 ? strip : paper);
  // Folded bottom-right corner and a soft shadow on the board.
  set(x + NOTE_W - 1, NOTE_Y + NOTE_H - 1, strip);
  for (let dy = 1; dy <= NOTE_H; dy++) set(x + NOTE_W, NOTE_Y + dy, SHADOW);
  const n = Math.min(99, count);
  if (n < 10) drawDigit(out, n, x + 2, NOTE_Y + 2);
  else {
    drawDigit(out, Math.floor(n / 10), x, NOTE_Y + 2);
    drawDigit(out, n % 10, x + 4, NOTE_Y + 2);
  }
}

let cache: { base: SpriteData; key: string; sprite: SpriteData } | null = null;

/** The board sprite with one sticky note per status, its count written on it. */
export function whiteboardSprite(base: SpriteData, counts: TaskCounts): SpriteData {
  const key = `${counts.running},${counts.waiting},${counts.done}`;
  if (cache && cache.base === base && cache.key === key) return cache.sprite;
  const out = base.map((row) => row.slice());
  for (const { key, x } of NOTES) {
    const { paper, strip } = WHITEBOARD_NOTE_COLORS[key];
    drawNote(out, x, paper, strip, counts[key]);
  }
  cache = { base, key, sprite: out };
  return out;
}
