// The executive chair (16x32: front, back, side) and the "CEO" wall plaque.
// MIT like the rest of the repo.

import { canvas } from './canvas.mjs';

// ── Executive chair (1x2 tiles, the seat is the bottom tile) ───────────

/** Tufted oxblood back panel x0..x1, y0..y1 with gold nailheads around it. */
function tuftedBack(c, x0, y0, x1, y1) {
  c.box(x0, y0, x1, y1, 'o', 'R');
  // Rolled top.
  c.hline(x0 + 1, x1 - 1, y0 + 1, 'q');
  c.hline(x0 + 2, x1 - 2, y0 + 1, 'Q');
  // Diamond tufting: buttons with a crease below-right and a gloss above-left.
  for (let y = y0 + 3, row = 0; y <= y1 - 2; y += 3, row++) {
    for (let x = x0 + 2 + (row % 2) * 2; x <= x1 - 2; x += 4) {
      c.set(x, y, 'r');
      c.set(x - 1, y - 1, 'q');
      c.set(x + 1, y + 1, 'r');
    }
  }
  // Nailhead trim on the sides.
  for (let y = y0 + 2; y < y1; y += 2) {
    c.set(x0 + 1, y, 'G');
    c.set(x1 - 1, y, 'G');
  }
  roundTop(c, x0, y0, x1);
}

/** Rounded top corners on a box whose top row is y0. */
function roundTop(c, x0, y0, x1) {
  c.set(x0, y0, '.');
  c.set(x1, y0, '.');
  c.set(x0 + 1, y0 + 1, 'o');
  c.set(x1 - 1, y0 + 1, 'o');
}

/** Five-star base on casters. */
function chairBase(c, cx, y) {
  c.vline(cx, y, y + 1, 'K');
  c.vline(cx + 1, y, y + 1, 'k');
  c.hline(cx - 5, cx + 6, y + 2, 'K');
  c.hline(cx - 4, cx + 5, y + 2, 'k');
  c.dots(
    [
      [cx - 5, y + 3],
      [cx + 6, y + 3],
      [cx, y + 3],
      [cx + 1, y + 3],
    ],
    'o',
  );
}

export function chairFront() {
  const c = canvas(16, 32);
  // Wingback: the back is wider than a cat, so it frames the seated Cat CEO.
  tuftedBack(c, 0, 0, 15, 21);
  c.dots(
    [
      [1, 0],
      [14, 0],
    ],
    '.',
  );
  c.dots(
    [
      [1, 1],
      [14, 1],
      [2, 1],
      [13, 1],
    ],
    'o',
  );
  c.dots(
    [
      [2, 0],
      [13, 0],
    ],
    'o',
  );
  // Dark crest with gold piping: above a seated cat it reads as the chair top.
  c.hline(3, 12, 1, 'r');
  c.hline(1, 14, 2, 'g');
  c.dots(
    [
      [4, 2],
      [11, 2],
    ],
    'G',
  );
  c.dots(
    [
      [7, 0],
      [8, 0],
      [7, 1],
      [8, 1],
    ],
    'G',
  );
  // Arms: padded rolls with gold caps.
  for (const x of [0, 13]) {
    c.box(x, 14, x + 2, 24, 'o', 'R');
    c.vline(x + 1, 15, 23, 'q');
    c.set(x + 1, 15, 'G');
  }
  // Seat cushion in front of the back.
  c.box(2, 20, 13, 25, 'o', 'R');
  c.hline(3, 12, 21, 'Q');
  c.hline(3, 12, 22, 'q');
  c.hline(3, 12, 24, 'r');
  c.dots(
    [
      [5, 23],
      [10, 23],
    ],
    'r',
  );
  chairBase(c, 7, 26);
  return c.rows();
}

export function chairBack() {
  const c = canvas(16, 32);
  // The back of the chair: smooth leather with a seam and the nailheads.
  c.box(2, 4, 13, 25, 'o', 'R');
  c.hline(3, 12, 5, 'q');
  c.hline(4, 11, 5, 'Q');
  roundTop(c, 2, 4, 13);
  c.vline(7, 7, 23, 'r');
  c.vline(8, 7, 23, 'q');
  for (let y = 6; y < 25; y += 2) {
    c.set(3, y, 'G');
    c.set(12, y, 'G');
  }
  c.hline(3, 12, 24, 'r');
  // Arm ends show beside the back.
  for (const x of [0, 14]) c.box(x, 17, x + 1, 24, 'o', 'r');
  chairBase(c, 7, 26);
  return c.rows();
}

export function chairSide() {
  const c = canvas(16, 32);
  // High back at the left, seat and arm to the right (faces right).
  c.box(2, 0, 6, 23, 'o', 'R');
  c.vline(3, 1, 22, 'q');
  roundTop(c, 2, 0, 6);
  c.set(4, 1, 'Q');
  for (let y = 3; y < 22; y += 3) c.set(5, y, 'r');
  c.box(5, 19, 13, 24, 'o', 'R');
  c.hline(6, 12, 20, 'Q');
  c.hline(6, 12, 21, 'q');
  c.hline(6, 12, 23, 'r');
  // Arm roll with a gold cap.
  c.box(6, 15, 13, 18, 'o', 'R');
  c.hline(7, 12, 16, 'q');
  c.set(12, 16, 'G');
  c.vline(12, 17, 18, 'r');
  chairBase(c, 7, 26);
  return c.rows();
}

// ── "CEO" wall plaque (hangs on the wall row like SMALL_PAINTING) ──────
export function ceoPlaque() {
  const c = canvas(16, 32);
  c.box(0, 11, 15, 23, 'o', 'd');
  c.box(1, 12, 14, 22, 'G', 'd');
  c.dots(
    [
      [1, 12],
      [14, 22],
    ],
    'y',
  );
  c.dots(
    [
      [1, 22],
      [14, 12],
    ],
    'g',
  );
  // C
  c.vline(3, 15, 19, 'G');
  c.hline(4, 5, 15, 'G');
  c.hline(4, 5, 19, 'G');
  // E
  c.vline(7, 15, 19, 'G');
  c.hline(8, 9, 15, 'G');
  c.set(8, 17, 'G');
  c.hline(8, 9, 19, 'G');
  // O
  c.vline(11, 15, 19, 'G');
  c.vline(13, 15, 19, 'G');
  c.set(12, 15, 'G');
  c.set(12, 19, 'G');
  c.dots(
    [
      [3, 15],
      [7, 15],
      [11, 15],
    ],
    'y',
  );
  // Brass hanger.
  c.dots(
    [
      [7, 10],
      [8, 10],
    ],
    'g',
  );
  c.set(7, 9, 'o');
  c.set(8, 9, 'o');
  return c.rows();
}
