// The executive desk: front and back 48x32 (3x2 tiles), side 32x48 (2x3).
// MIT like the rest of the repo.

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

// The banker's lamp and the desk globe, as in the front view, for the turned views.
const LAMP = [
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
];
const GLOBE = [
  '..ooo..',
  '.oBVVo.',
  'oBBVbbo',
  'oVBBBVG',
  'obBVbbG',
  '.obbbo.',
  '..ooG..',
  '..ggg..',
];

/** The polished top with its gloss and gold front lip: box x0..x1, y0..lipY. */
function top(c, x0, y0, x1, lipY) {
  c.box(x0, y0, x1, lipY + 2, 'o', 'M');
  c.hline(x0 + 1, x1 - 1, y0 + 1, 'H');
  c.hline(x0 + 1, x1 - 1, y0 + 2, 'H');
  c.hline(x0 + 1, x1 - 1, lipY, 'G');
  c.hline(x0 + 1, x1 - 1, lipY + 1, 'g');
}

// ── Back view (48x32): the CEO's side faces the room — drawers and the knee hole.
export function executiveDeskBack() {
  const c = canvas(48, 32);
  top(c, 1, 5, 46, 19);
  c.dots(
    [
      [8, 8],
      [9, 8],
      [10, 9],
      [40, 8],
      [41, 8],
      [42, 9],
      [5, 13],
      [6, 14],
      [27, 17],
      [28, 17],
    ],
    'h',
  );
  // Pad, turned: the gold nameplate now faces away (its plain back at the far edge).
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
  c.hline(19, 28, 7, 'g');
  c.hline(19, 28, 6, 'G');
  c.rect(22, 10, 28, 14, 'W');
  c.hline(23, 27, 11, 'w');
  c.hline(23, 26, 13, 'w');
  c.dots(
    [
      [18, 13],
      [19, 12],
      [20, 11],
    ],
    'G',
  );
  c.set(21, 10, 'o');
  // Lamp and globe now on the right, papers and trophy on the left.
  c.stamp(36, 4, LAMP);
  c.stamp(32, 9, GLOBE);
  c.box(6, 9, 12, 14, 'o', 'W');
  c.hline(7, 11, 11, 'w');
  c.hline(7, 11, 13, 'w');
  c.box(2, 9, 5, 12, 'o', 'G');
  c.set(3, 10, 'y');
  c.vline(3, 13, 14, 'g');
  c.hline(2, 5, 15, 'g');
  // CEO side, y 22..31: two drawer pedestals, an open dark knee hole between.
  c.box(1, 22, 46, 31, 'o', 'm');
  for (const [x0, x1] of [
    [2, 14],
    [33, 45],
  ]) {
    for (const [y0, y1] of [
      [23, 25],
      [26, 28],
      [29, 30],
    ])
      c.box(x0 + 1, y0, x1 - 1, y1, 'd', 'm');
    const mid = Math.floor((x0 + x1) / 2);
    for (const y of [24, 27]) {
      c.hline(mid - 1, mid + 1, y, 'G');
      c.set(mid - 1, y, 'y');
    }
    c.hline(x0 + 2, x1 - 2, 23, 'H');
  }
  c.rect(15, 22, 32, 31, 'o');
  c.rect(16, 22, 31, 23, 'd');
  c.hline(16, 31, 22, 'm');
  c.vline(15, 22, 31, 'd');
  c.vline(32, 22, 31, 'd');
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

// ── Side view (32x48): the desk turned, its front (crest panel) to the right.
export function executiveDeskSide() {
  const c = canvas(32, 48);
  top(c, 1, 5, 30, 37);
  c.dots(
    [
      [4, 8],
      [5, 8],
      [6, 9],
      [24, 12],
      [25, 13],
      [3, 30],
      [4, 31],
      [26, 33],
      [27, 33],
    ],
    'h',
  );
  // Pad along the long axis, nameplate on its right edge (the visitor side).
  c.box(8, 15, 20, 30, 'g', 'L');
  c.vline(9, 16, 29, 'E');
  c.hline(10, 19, 16, 'E');
  c.vline(19, 16, 29, 'l');
  c.dots(
    [
      [8, 15],
      [20, 15],
      [8, 30],
      [20, 30],
    ],
    'G',
  );
  c.rect(11, 19, 16, 25, 'W');
  c.vline(12, 20, 24, 'w');
  c.vline(14, 20, 23, 'w');
  c.dots(
    [
      [13, 27],
      [14, 28],
      [15, 29],
    ],
    'G',
  );
  c.box(21, 19, 23, 27, 'g', 'G');
  c.dots(
    [
      [22, 21],
      [22, 23],
      [22, 25],
    ],
    'o',
  );
  c.set(22, 20, 'y');
  // Lamp at the far end, globe beside it; papers and trophy at the near end.
  c.stamp(3, 3, LAMP);
  c.stamp(18, 6, GLOBE);
  c.box(3, 30, 8, 35, 'o', 'W');
  c.hline(4, 7, 32, 'w');
  c.hline(4, 7, 34, 'w');
  c.box(23, 30, 26, 33, 'o', 'G');
  c.set(24, 31, 'y');
  c.vline(24, 34, 35, 'g');
  c.hline(23, 26, 36, 'g');
  // The near end: a pedestal side panel with a raised gold-framed field.
  c.box(1, 40, 30, 47, 'o', 'm');
  c.box(3, 41, 13, 46, 'd', 'm');
  c.box(18, 41, 28, 46, 'd', 'm');
  c.hline(4, 12, 41, 'H');
  c.hline(19, 27, 41, 'H');
  c.box(5, 42, 11, 45, 'g', 'm');
  c.box(20, 42, 26, 45, 'g', 'm');
  c.rect(14, 40, 17, 47, 'd');
  c.hline(1, 30, 47, 'o');
  c.dots(
    [
      [2, 47],
      [3, 47],
      [28, 47],
      [29, 47],
    ],
    'g',
  );
  return c.rows();
}
