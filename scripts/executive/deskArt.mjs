// The executive desk (48x32). MIT like the rest of the repo.

import { canvas } from './canvas.mjs';

// ── Executive desk (3x2 tiles, front view: the CEO sits behind it) ─────
export function executiveDesk() {
  const c = canvas(48, 32);
  // Polished top, y 5..21 (its top row is a background row: the seated CEO shows above it).
  c.box(1, 5, 46, 21, 'o', 'M');
  c.hline(2, 45, 6, 'H');
  c.hline(2, 45, 7, 'H');
  // Gloss streaks on the lacquer.
  c.dots(
    [
      [4, 8],
      [5, 8],
      [6, 9],
      [36, 8],
      [37, 8],
      [38, 9],
      [39, 9],
      [42, 12],
      [43, 13],
      [3, 17],
      [4, 18],
      [30, 18],
      [31, 18],
    ],
    'h',
  );
  // Gold trim along the front edge of the top, and a dark lip below it.
  c.hline(2, 45, 19, 'G');
  c.dots(
    [
      [6, 19],
      [17, 19],
      [30, 19],
      [41, 19],
    ],
    'y',
  );
  c.hline(2, 45, 20, 'g');
  c.hline(1, 46, 21, 'o');

  // Green leather desk pad with a gold border (middle third).
  c.box(15, 8, 32, 16, 'g', 'L');
  c.hline(16, 31, 9, 'E');
  c.vline(16, 10, 15, 'E');
  c.hline(16, 31, 15, 'l');
  c.dots(
    [
      [15, 8],
      [32, 8],
      [15, 16],
      [32, 16],
    ],
    'G',
  );
  // A sheet of paper and a gold fountain pen on the pad.
  c.rect(19, 10, 25, 14, 'W');
  c.hline(20, 24, 11, 'w');
  c.hline(20, 23, 13, 'w');
  c.dots(
    [
      [27, 13],
      [28, 12],
      [29, 11],
    ],
    'G',
  );
  c.set(30, 10, 'o');

  // Gold nameplate at the front of the pad.
  c.box(19, 16, 28, 18, 'g', 'G');
  c.dots(
    [
      [21, 17],
      [23, 17],
      [24, 17],
      [26, 17],
    ],
    'o',
  );
  c.set(20, 17, 'y');

  // Banker's lamp (left third): green dome shade, brass rim, stem and base.
  c.stamp(2, 4, [
    '...oooo...',
    '..oEELLo..',
    '.oELLLLLo.',
    'oELLLLLLlo',
    'ogGGGGGGgo',
    '.eeeeeeee.',
    '..e.Gg.e..',
    '....Gg....',
    '....Gg....',
    '...yGGG...',
    '..gggggg..',
  ]);

  // Desk globe beside the lamp on a brass stand.
  c.stamp(9, 9, [
    '..ooo..',
    '.oBVVo.',
    'oBBVbbo',
    'oVBBBVG',
    'obBVbbG',
    '.obbbo.',
    '..ooG..',
    '..ggg..',
  ]);

  // Right third: a short stack of papers and a small gold trophy.
  c.box(35, 9, 41, 14, 'o', 'W');
  c.hline(36, 40, 11, 'w');
  c.hline(36, 40, 13, 'w');
  c.box(42, 9, 45, 12, 'o', 'G');
  c.set(43, 10, 'y');
  c.vline(43, 13, 14, 'g');
  c.hline(42, 45, 15, 'g');

  // Front panel, y 22..30: two drawer pedestals and a recessed middle.
  c.box(1, 22, 46, 31, 'o', 'm');
  for (const [x0, x1] of [
    [2, 14],
    [33, 45],
  ]) {
    // Two drawers per pedestal with brass pulls.
    c.box(x0 + 1, 23, x1 - 1, 26, 'd', 'm');
    c.box(x0 + 1, 27, x1 - 1, 30, 'd', 'm');
    const mid = Math.floor((x0 + x1) / 2);
    for (const y of [24, 28]) {
      c.hline(mid - 1, mid + 1, y, 'G');
      c.set(mid - 1, y, 'y');
      c.hline(mid - 1, mid + 1, y + 1, 'g');
    }
    c.hline(x0 + 2, x1 - 2, 23, 'H');
  }
  c.vline(15, 22, 30, 'd');
  c.vline(32, 22, 30, 'd');
  // Middle: a darker modesty panel with a gold inlay frame and a crest.
  c.rect(16, 22, 31, 30, 'd');
  c.box(18, 24, 29, 29, 'G', 'd');
  c.dots(
    [
      [18, 24],
      [29, 29],
    ],
    'y',
  );
  c.dots(
    [
      [23, 26],
      [24, 26],
      [23, 27],
      [24, 27],
    ],
    'G',
  );
  c.dots(
    [
      [22, 26],
      [25, 27],
    ],
    'g',
  );
  // Plinth with gold feet.
  c.hline(1, 46, 31, 'o');
  c.dots(
    [
      [2, 31],
      [3, 31],
      [44, 31],
      [45, 31],
    ],
    'g',
  );
  return c.rows();
}
