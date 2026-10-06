// The whiteboard (48x32, 3 tiles wide like the lead desk, a wall item): a clean white board in an aluminum
// frame with a marker doodle of a mouse, and a tray with three markers and an
// eraser. MIT like the rest of the repo.

import { canvas } from './canvas.mjs';

export function whiteboard() {
  const c = canvas(48, 32);
  // Frame: dark outline, aluminum ring lit from the top left.
  c.box(1, 6, 46, 23, 'n', 'a');
  c.hline(2, 45, 7, 'A');
  c.vline(2, 7, 22, 'A');
  c.hline(2, 45, 22, 'S');
  c.vline(45, 8, 22, 'S');
  c.rect(3, 8, 44, 21, 'I');
  // A mouse doodle in dark marker: big round ear (red inside), dot eye,
  // red nose, a dome body on two feet, and a curly tail. Centred on the board.
  c.stamp(11, 8, [
    '........nnnn..............',
    '.......n....n.............',
    '......n..1...n............',
    '......n..11..nnnnn........',
    '.......n....n.....n.......',
    '........nnnn.......n......',
    '.......n............n..n..',
    '.....nn..n..........n.n.n.',
    '...nn...............n.n.n.',
    '..1n................n..n..',
    '...nn..............n..n...',
    '.....nnnnnnnnnnnnnnnnn....',
    '........n.....n...........',
  ]);
  // Tray under the board with three markers and an eraser.
  c.box(3, 24, 44, 25, 'n', 'a');
  c.hline(4, 43, 24, 'A');
  for (const [x, ink] of [
    [14, '1'],
    [19, '2'],
    [24, '3'],
  ]) {
    c.hline(x, x + 1, 23, ink);
    c.hline(x + 2, x + 3, 23, 'i');
  }
  c.hline(29, 33, 23, 'K');
  c.hline(30, 32, 23, 'k');
  return c.rows();
}
