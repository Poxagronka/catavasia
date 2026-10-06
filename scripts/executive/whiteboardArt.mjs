// The whiteboard (32x32, a wall item): white board in an aluminum frame,
// marker scribbles, and a tray with three markers and an eraser. MIT like the
// rest of the repo.
//
// The middle band (x 3..28, y 12..20) is the note area: the office draws one
// sticky note per task status there at run time
// (webview-ui/src/office/engine/whiteboardNotes.ts). Keep the two in step.

import { canvas } from './canvas.mjs';

export function whiteboard() {
  const c = canvas(32, 32);
  // Frame: dark outline, aluminum ring lit from the top left.
  c.box(1, 6, 30, 23, 'n', 'a');
  c.hline(2, 29, 7, 'A');
  c.vline(2, 7, 22, 'A');
  c.hline(2, 29, 22, 'S');
  c.vline(29, 8, 22, 'S');
  c.rect(3, 8, 28, 21, 'I');
  // Scribbles: a blue heading with a red underline, a green tick list on the right.
  c.dots(
    [
      [5, 9],
      [6, 9],
      [7, 10],
      [8, 9],
      [9, 9],
      [10, 10],
      [11, 9],
      [13, 9],
      [14, 10],
      [15, 9],
    ],
    '2',
  );
  c.hline(5, 16, 11, '1');
  c.dots(
    [
      [20, 10],
      [21, 11],
      [22, 9],
      [24, 10],
      [25, 10],
      [26, 10],
    ],
    '3',
  );
  // Faint marker loops in the note area show when the office draws no notes.
  c.dots(
    [
      [6, 15],
      [7, 14],
      [8, 15],
      [9, 16],
      [10, 15],
      [15, 17],
      [16, 16],
      [17, 17],
      [18, 18],
      [23, 14],
      [24, 15],
      [25, 14],
      [26, 15],
    ],
    'u',
  );
  // Tray under the board with three markers and an eraser.
  c.box(3, 24, 28, 25, 'n', 'a');
  c.hline(4, 27, 24, 'A');
  for (const [x, ink] of [
    [6, '1'],
    [11, '2'],
    [16, '3'],
  ]) {
    c.hline(x, x + 1, 23, ink);
    c.hline(x + 2, x + 3, 23, 'i');
  }
  c.hline(21, 25, 23, 'K');
  c.hline(22, 24, 23, 'k');
  return c.rows();
}
