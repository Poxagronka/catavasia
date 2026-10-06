// The team lead's furniture: a warm oak desk (front and back 48x32, side 32x48) with
// two monitors, a desk plant, a mug and a "LEAD" nameplate, and a padded
// office chair with armrests (16x32: front, back, side). It sits between the
// plain worker desk and the Cat CEO's mahogany executive desk: nicer wood and
// gear than a worker gets, no gold and no leather. MIT like the rest of the repo.

import { canvas } from './canvas.mjs';

/** 3x5 pixel letters of the nameplate. */
const LETTERS = {
  L: ['#..', '#..', '#..', '#..', '###'],
  E: ['###', '#..', '##.', '#..', '###'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
};

/** "LEAD" in colour `ink` with its top-left corner at (x, y): 15x5 px. */
function leadWord(c, x, y, ink) {
  [...'LEAD'].forEach((ch, i) =>
    c.stamp(
      x + i * 4,
      y,
      LETTERS[ch].map((row) => row.replaceAll('#', ink)),
    ),
  );
}

/** A monitor seen from behind: dark casing, a vent line, the stand. */
function monitorBack(c, x0, y0) {
  c.box(x0, y0, x0 + 11, y0 + 8, 'n', 'K');
  c.hline(x0 + 1, x0 + 10, y0 + 1, 'k');
  c.hline(x0 + 3, x0 + 8, y0 + 5, 'n');
  c.vline(x0 + 5, y0 + 9, y0 + 10, 'n');
  c.vline(x0 + 6, y0 + 9, y0 + 10, 'K');
  c.hline(x0 + 3, x0 + 8, y0 + 11, 'n');
}

/** A small potted plant: leaves over a terracotta pot, 6x9 px. */
function deskPlant(c, x, y) {
  c.stamp(x, y, ['.J.j..', 'JjJjj.', '.jJjJj', 'jjjJj.', '.ojjo.', '.oppo.', '.oppo.', '..oo..']);
}

/** A white mug of coffee with its handle at the right, 5x5 px. */
function mug(c, x, y) {
  c.stamp(x, y, ['oooo.', 'oddoo', 'oiio.', 'oiioo', '.oo..']);
}

// ── Desk, front view (3x2 tiles): the lead sits behind it, facing the room ──
export function leadDeskFront() {
  const c = canvas(48, 32);
  // Oak top, y 7..20. Its top row is a background row: the seated lead shows above it.
  c.box(1, 7, 46, 20, 'o', 'O');
  c.hline(2, 45, 8, 'T');
  // Wood grain.
  for (const [x0, x1, y] of [
    [4, 11, 11],
    [30, 40, 12],
    [14, 22, 17],
    [36, 43, 16],
  ])
    c.hline(x0, x1, y, 'P');
  // Front lip of the top.
  c.hline(2, 45, 19, 'U');
  c.hline(1, 46, 20, 'o');

  // Two monitors on the far edge (their screens face the lead), the middle stays clear.
  monitorBack(c, 2, 0);
  monitorBack(c, 34, 0);
  // Keyboard and mouse in front of the lead.
  c.box(18, 13, 29, 16, 'S', 'a');
  c.hline(19, 28, 14, 'A');
  c.dots(
    [
      [20, 15],
      [22, 15],
      [24, 15],
      [26, 15],
    ],
    'S',
  );
  c.box(31, 14, 32, 16, 'S', 'A');
  // A mug at the left front corner, a plant at the right.
  mug(c, 5, 13);
  deskPlant(c, 40, 12);

  // Front panel, y 21..31: two drawer pedestals and a recessed middle.
  c.box(1, 21, 46, 31, 'o', 'U');
  for (const [x0, x1] of [
    [2, 13],
    [34, 45],
  ]) {
    c.box(x0, 22, x1, 25, 'D', 'U');
    c.box(x0, 26, x1, 30, 'D', 'U');
    c.hline(x0 + 1, x1 - 1, 22, 'O');
    const mid = Math.floor((x0 + x1) / 2);
    for (const y of [23, 28]) {
      c.hline(mid - 1, mid + 2, y, 'a');
      c.set(mid - 1, y, 'A');
    }
  }
  c.rect(14, 21, 33, 30, 'D');
  // Brushed-steel nameplate with "LEAD".
  c.box(15, 23, 32, 29, 'S', 'A');
  c.hline(16, 31, 24, 'i');
  leadWord(c, 17, 24, 'n');
  c.hline(1, 46, 31, 'o');
  return c.rows();
}

// ── Desk, side view (2x3 tiles): the lead sits at its left, facing right ──
export function leadDeskSide() {
  const c = canvas(32, 48);
  c.box(3, 8, 28, 39, 'o', 'O');
  c.vline(4, 9, 38, 'T');
  for (const [x, y0, y1] of [
    [12, 10, 16],
    [17, 30, 37],
    [26, 12, 20],
  ])
    c.vline(x, y0, y1, 'P');
  c.vline(27, 9, 38, 'U');
  // Two monitors in profile on the far (right) edge: the blue screens face the lead.
  for (const y of [10, 24]) {
    c.box(21, y, 24, y + 9, 'n', 'K');
    c.vline(21, y + 1, y + 8, 'Z');
    c.vline(23, y + 1, y + 8, 'k');
    c.hline(23, 25, y + 10, 'n');
    c.hline(20, 26, y + 11, 'n');
  }
  // Keyboard and mouse at the near edge, a sheet of notes, a mug and a plant.
  c.box(6, 15, 9, 30, 'S', 'a');
  c.vline(7, 16, 29, 'A');
  c.box(7, 32, 8, 34, 'S', 'A');
  c.box(12, 19, 17, 26, 'w', 'W');
  c.hline(13, 16, 21, 'w');
  c.hline(13, 15, 23, 'w');
  mug(c, 12, 30);
  deskPlant(c, 12, 9);
  // The short end of the desk faces the room: one drawer.
  c.box(3, 40, 28, 47, 'o', 'U');
  c.box(5, 41, 26, 45, 'D', 'U');
  c.hline(14, 17, 43, 'a');
  c.set(14, 43, 'A');
  c.hline(3, 28, 47, 'o');
  return c.rows();
}

/** A monitor seen from the front: a lit blue screen with lines of text, the stand. */
function monitorFront(c, x0, y0) {
  c.box(x0, y0, x0 + 11, y0 + 8, 'n', 'Z');
  c.hline(x0 + 2, x0 + 7, y0 + 2, 'c');
  c.hline(x0 + 2, x0 + 9, y0 + 4, 'c');
  c.hline(x0 + 2, x0 + 5, y0 + 6, 'c');
  c.vline(x0 + 5, y0 + 9, y0 + 10, 'n');
  c.vline(x0 + 6, y0 + 9, y0 + 10, 'K');
  c.hline(x0 + 3, x0 + 8, y0 + 11, 'n');
}

// ── Desk, back view (3x2 tiles): the lead sits in front of it, facing away ──
export function leadDeskBack() {
  const c = canvas(48, 32);
  c.box(1, 7, 46, 20, 'o', 'O');
  c.hline(2, 45, 8, 'T');
  for (const [x0, x1, y] of [
    [36, 43, 11],
    [7, 17, 12],
    [25, 33, 17],
    [4, 11, 16],
  ])
    c.hline(x0, x1, y, 'P');
  c.hline(2, 45, 19, 'U');
  c.hline(1, 46, 20, 'o');
  // The far edge, turned: the plant at the left, the mug between the monitors.
  deskPlant(c, 2, 4);
  mug(c, 22, 9);
  // The monitors on the lead's edge: their screens face the lead and the room.
  monitorFront(c, 4, 8);
  monitorFront(c, 32, 8);
  // Keyboard and mouse between them, by the lead's paws.
  c.box(18, 15, 29, 18, 'S', 'a');
  c.hline(19, 28, 16, 'A');
  c.box(15, 16, 16, 18, 'S', 'A');
  // The lead's side, y 21..31: two drawer pedestals and the open knee hole.
  c.box(1, 21, 46, 31, 'o', 'U');
  for (const [x0, x1] of [
    [2, 13],
    [34, 45],
  ]) {
    c.box(x0, 22, x1, 25, 'D', 'U');
    c.box(x0, 26, x1, 30, 'D', 'U');
    c.hline(x0 + 1, x1 - 1, 22, 'O');
    const mid = Math.floor((x0 + x1) / 2);
    for (const y of [23, 28]) {
      c.hline(mid - 1, mid + 2, y, 'a');
      c.set(mid - 1, y, 'A');
    }
  }
  c.rect(14, 21, 33, 31, 'o');
  c.hline(15, 32, 21, 'D');
  c.hline(1, 46, 31, 'o');
  return c.rows();
}

// ── Chair (1x2 tiles, the seat is the bottom tile) ──────────────────────

/** Five-star base on casters, 4 px tall from y. */
function base(c, cx, y) {
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

/** Padded backrest x0..x1, y0..y1 with a lumbar seam and rounded top. */
function backrest(c, x0, y0, x1, y1) {
  c.box(x0, y0, x1, y1, 'o', 'F');
  c.set(x0, y0, '.');
  c.set(x1, y0, '.');
  c.hline(x0 + 1, x1 - 1, y0 + 1, 'N');
  c.vline(x0 + 1, y0 + 2, y1 - 1, 'N');
  c.hline(x0 + 1, x1 - 1, Math.floor((y0 + y1) / 2) + 2, 'f');
}

export function leadChairFront() {
  const c = canvas(16, 32);
  // Full-width back: it frames the seated lead, so it reads as a chair, not a hat.
  backrest(c, 0, 3, 15, 20);
  // Armrests: black pads on steel posts.
  for (const x of [0, 13]) {
    c.box(x, 14, x + 2, 16, 'o', 'n');
    c.set(x + 1, 15, 'k');
    c.vline(x + 1, 17, 22, 'K');
  }
  // Seat cushion in front of the back.
  c.box(2, 19, 13, 24, 'o', 'F');
  c.hline(3, 12, 20, 'N');
  c.hline(3, 12, 23, 'f');
  base(c, 7, 25);
  return c.rows();
}

export function leadChairBack() {
  const c = canvas(16, 32);
  backrest(c, 2, 3, 13, 22);
  c.vline(7, 6, 20, 'f');
  // The tilt knob and the arm ends beside the back.
  c.box(6, 23, 9, 24, 'o', 'K');
  for (const x of [0, 14]) c.box(x, 16, x + 1, 21, 'o', 'n');
  base(c, 7, 25);
  return c.rows();
}

export function leadChairSide() {
  const c = canvas(16, 32);
  // Back at the left, seat and arm to the right (faces right).
  c.box(2, 3, 5, 21, 'o', 'F');
  c.vline(3, 4, 20, 'N');
  c.set(2, 3, '.');
  c.box(4, 19, 13, 23, 'o', 'F');
  c.hline(5, 12, 20, 'N');
  c.hline(5, 12, 22, 'f');
  // Armrest pad on its post.
  c.box(5, 15, 12, 16, 'o', 'n');
  c.hline(6, 11, 15, 'k');
  c.vline(9, 17, 18, 'K');
  base(c, 7, 25);
  return c.rows();
}
