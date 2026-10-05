// Pose definitions for the upright office cat.
// Sprite contract (see CLAUDE.md "Character sprites"): 16x32 frames, rows
// down / up / right, frames walk1 walk2 walk3 type1 type2 read1 read2.
// Feet sit on the bottom rows because the renderer anchors bottom-center.

import { Frame } from './canvas.mjs';

// z-order: tail(back) < legs < torso < tail(front) < paper < arms < head
const Z = { tailBack: 1, leg: 2, torso: 3, tailFront: 4, paper: 5, arm: 6, head: 7 };

// ── Heads (12 px wide; row 0 = top of skull, ears drawn above) ──────────
const FACE = {
  down: [
    'FiFhhhhhhFiF',
    'FFFFhhhhFFFF',
    'FFFFFFFFFFFF',
    'FFeEFFFFEeFF',
    'FFeEFFFFEeFF',
    'fFWWWnnWWWFf',
    'fFWWmWWmWWFf',
    '.ffWWWWWWff.',
  ],
  up: [
    'FfFhhhhhhFfF',
    'FFFFhhhhFFFF',
    'FFFFFFFFFFFF',
    'FFFFFFFFFFFF',
    'FFFFFFFFFFFF',
    'fFFFFFFFFFFf',
    'fFFFFFFFFFFf',
    '.ffFFFFFFff.',
  ],
  right: [
    '.FfFhhhFiF..',
    'FFFFhhhhFFF.',
    'FFFFFFFFFFF.',
    'FFFFFFFFeEF.',
    'fFFFFFFFeEFW',
    'fFFFFFFWWWWn',
    'fFFFFFFWWmW.',
    '.ffFFFFWWW..',
  ],
};

const EARS = {
  down: {
    pointed: ['F..........F', 'FF........FF', 'FiF......FiF'],
    big: ['F..........F', 'FF........FF', 'FiF......FiF', 'FiiF....FiiF'],
  },
  right: {
    pointed: ['..F.....F...', '.fF....FiF..', '.ffF..FiiF..'],
    big: ['..F.....F...', '.fF....FF...', '.ffF..FiiF..', '.fffFFiiiF..'],
  },
};

/** Skull row under the ears: the inner ear runs into it. */
const EAR_ROW0 = {
  pointed: { down: 'FiiFhhhhFiiF', right: '.FfFhhhFiiF.' },
  big: { down: 'FiiiFhhFiiiF', right: '.FffFhhFiiF.' },
};

function drawHead(fr, dir, x, y, cat) {
  const earDir = dir === 'right' ? 'right' : 'down';
  let ears = EARS[earDir][cat.ears === 'big' ? 'big' : 'pointed'];
  const face = FACE[dir].slice();
  face[0] = EAR_ROW0[cat.ears === 'big' ? 'big' : 'pointed'][earDir];
  if (dir === 'up') {
    ears = ears.map((r) => r.replaceAll('i', 'f'));
    face[0] = face[0].replaceAll('i', 'f');
  }
  fr.stamp(ears, x, y - ears.length, 'head', Z.head, { rim: true, lyShift: -ears.length });
  fr.stamp(face, x, y, 'head', Z.head, { rim: true });
  const top = y - ears.length - 1;
  if (cat.ears === 'tufted') {
    const tips = dir === 'right' ? [x + 2, x + 8] : [x, x + 11];
    for (const tx of tips) fr.addOverlay(tx, top - 1, 'outline');
  }
  if (cat.ruff) {
    const sides =
      dir === 'right'
        ? [[x - 1, 1]]
        : [
            [x - 1, 1],
            [x + 12, -1],
          ];
    for (const [sx] of sides) {
      fr.set(sx, y + 5, { label: 'belly', part: 'head', lx: 0, ly: 5, z: Z.head, rim: true });
      fr.set(sx, y + 6, { label: 'belly', part: 'head', lx: 0, ly: 6, z: Z.head, rim: true });
    }
  }
  if (!cat.whiskers) return;
  if (dir === 'down') {
    const left = cat.ruff ? x - 3 : x - 2;
    const right = cat.ruff ? x + 14 : x + 13;
    fr.addOverlay(left, y + 5, 'whisker');
    fr.addOverlay(left + 1, y + 5, 'whisker');
    fr.addOverlay(right, y + 5, 'whisker');
    fr.addOverlay(right - 1, y + 5, 'whisker');
    fr.addOverlay(left, y + 6, 'whisker');
    fr.addOverlay(right, y + 6, 'whisker');
  } else if (dir === 'right') {
    fr.addOverlay(x + 12, y + 6, 'whisker');
    fr.addOverlay(x + 13, y + 6, 'whisker');
    fr.addOverlay(x + 12, y + 7, 'whisker');
  }
}

// ── Torso ───────────────────────────────────────────────────────────────
const TORSO = {
  down: [
    '.FFFFFF.',
    'CCCCCCCC',
    'fFWWWWFf',
    'fFWWWWFf',
    'fFWWWWFf',
    'fFFWWFFf',
    'fFFFFFFf',
    'ffFFFFff',
  ],
  up: [
    '.FFFFFF.',
    'CCCCCCCC',
    'fFFFFFFf',
    'fFFhhFFf',
    'fFFFFFFf',
    'fFFFFFFf',
    'fFFFFFFf',
    'ffFFFFff',
  ],
  right: ['.FFFF.', 'CCCCCC', 'fFFFWW', 'fFFFWW', 'fFFFFW', 'fFFFFF', 'fFFFFF', 'ffFFFF'],
};

function drawTorso(fr, dir, x, y) {
  fr.stamp(TORSO[dir], x, y, 'torso', Z.torso);
}

/** Vertical leg: fur column with a paw row at the bottom. */
function leg(fr, part, x, yTop, yBot, w) {
  fr.rect(x, yTop, w, yBot - yTop, part, Z.leg);
  fr.rect(x, yBot, w, 1, part, Z.leg, 'paw');
}

function arm(fr, part, pts, thick = 2, tip = 2) {
  fr.stroke(pts, thick, part, Z.arm, { rim: true, tip });
}

const TAIL_THICK = { thin: 1, normal: 2, bushy: 3 };

function tail(fr, cat, pts, front) {
  const t = TAIL_THICK[cat.tail];
  // Bushy tails grow toward the body so they never leave the frame.
  const shifted = t === 3 ? pts.map(([px, py]) => [px - 1, py - 1]) : pts;
  fr.stroke(shifted, t, 'tail', front ? Z.tailFront : Z.tailBack, {
    rim: front,
    tip: 2,
    tipLabel: 'tailTip',
  });
}

function paper(fr, x, y, w, h) {
  for (let r = 0; r < h; r++) {
    const ink = r % 2 === 1 && r < h - 1;
    const row = 'Q' + (ink ? 'q'.repeat(w - 3) + 'QQ' : 'Q'.repeat(w - 1));
    fr.stamp([row], x, y + r, 'paper', Z.paper, { rim: true, lyShift: r });
  }
}

// ── Frames per direction ────────────────────────────────────────────────
// Each function draws one frame index 0..6.

function down(fr, i, cat, dir = 'down') {
  const back = dir === 'up';
  if (i <= 2) {
    const bob = i === 1 ? 0 : -1;
    const fy = 7 + bob;
    const legL = i === 0 ? 1 : i === 2 ? -1 : 0;
    drawHead(fr, dir, 2, fy, cat);
    drawTorso(fr, dir, 4, fy + 8);
    leg(fr, 'legL', 4, fy + 16, 28 + Math.max(legL, 0) - (legL < 0 ? 2 : 0), 3);
    leg(fr, 'legR', 9, fy + 16, 28 + Math.max(-legL, 0) - (legL > 0 ? 2 : 0), 3);
    arm(fr, 'armL', [
      [2, fy + 9],
      [2, fy + 13 - legL],
    ]);
    arm(fr, 'armR', [
      [12, fy + 9],
      [12, fy + 13 + legL],
    ]);
    if (back)
      tail(
        fr,
        cat,
        [
          [7, fy + 14],
          [7, fy + 19],
          [8, fy + 20],
        ],
        true,
      );
    else
      tail(
        fr,
        cat,
        [
          [10, 27],
          [12, 27],
          [13, 25],
          [13, 24],
        ],
        false,
      );
    return;
  }
  const typing = i <= 4;
  const alt = i % 2 === 1 ? 0 : 1;
  if (back) {
    const fy = 8 + (!typing && alt ? 1 : 0);
    drawHead(fr, dir, 2, fy, cat);
    drawTorso(fr, dir, 4, fy + 8);
    fr.rect(4, fy + 16, 8, 2, 'legL', Z.leg);
    const lift = typing ? alt : 1;
    arm(
      fr,
      'armL',
      [
        [2, fy + 9 - lift],
        [2, fy + 11 - lift],
      ],
      2,
      0,
    );
    arm(
      fr,
      'armR',
      [
        [12, fy + 9 - (typing ? 1 - alt : 1)],
        [12, fy + 11 - (typing ? 1 - alt : 1)],
      ],
      2,
      0,
    );
    tail(
      fr,
      cat,
      [
        [8, fy + 16],
        [10, fy + 18],
        [12, fy + 18],
        [13, fy + 16],
      ],
      true,
    );
    return;
  }
  const fy = 10 + (!typing && alt ? 1 : 0);
  drawHead(fr, dir, 2, fy, cat);
  drawTorso(fr, dir, 4, fy + 8);
  leg(fr, 'legL', 4, 26, 30, 3);
  leg(fr, 'legR', 9, 26, 30, 3);
  tail(
    fr,
    cat,
    [
      [10, 29],
      [12, 29],
      [13, 27],
      [13, 26],
    ],
    false,
  );
  if (typing) {
    arm(fr, 'armL', [
      [2, fy + 9],
      [3, fy + 12],
      [5, fy + 13 - alt],
    ]);
    arm(fr, 'armR', [
      [12, fy + 9],
      [11, fy + 12],
      [9, fy + 12 + alt],
    ]);
  } else {
    paper(fr, 4, fy + 11, 8, 6);
    arm(fr, 'armL', [
      [2, fy + 9],
      [2, fy + 11],
      [3, fy + 12],
    ]);
    arm(fr, 'armR', [
      [12, fy + 9],
      [12, fy + 11],
      [11, fy + 12],
    ]);
  }
}

function right(fr, i, cat) {
  if (i <= 2) {
    const fy = i === 1 ? 7 : 6;
    drawHead(fr, 'right', 2, fy, cat);
    drawTorso(fr, 'right', 5, fy + 8);
    const front = [
      [
        [9, fy + 16],
        [10, 27],
      ],
      [
        [8, fy + 16],
        [8, 27],
      ],
      [
        [8, fy + 16],
        [7, 27],
      ],
    ][i];
    const backLeg = [
      [
        [6, fy + 16],
        [4, 27],
      ],
      [
        [5, fy + 16],
        [5, 27],
      ],
      [
        [6, fy + 16],
        [7, 27],
      ],
    ][i];
    fr.stroke(backLeg, 2, 'legB', Z.leg - 0.5, { tip: 1 });
    fr.stroke(front, 2, 'legF', Z.leg, { tip: 1 });
    const hand = [
      [9, fy + 13],
      [7, fy + 14],
      [5, fy + 13],
    ][i];
    arm(fr, 'armR', [[7, fy + 9], hand]);
    tail(
      fr,
      cat,
      [
        [5, fy + 14],
        [3, fy + 13],
        [2, fy + 11],
        [2, fy + 8],
      ],
      false,
    );
    return;
  }
  const typing = i <= 4;
  const alt = i % 2 === 1 ? 0 : 1;
  const fy = 9 + (!typing && alt ? 1 : 0);
  drawHead(fr, 'right', 2, fy, cat);
  drawTorso(fr, 'right', 5, fy + 8);
  fr.rect(7, 26, 5, 2, 'legF', Z.leg);
  leg(fr, 'legF', 10, 28, 29, 2);
  tail(
    fr,
    cat,
    [
      [5, 25],
      [3, 25],
      [2, 23],
      [2, 21],
    ],
    false,
  );
  if (typing) {
    arm(fr, 'armR', [
      [7, fy + 9],
      [9, fy + 11],
      [12, fy + 11 - alt],
    ]);
  } else {
    paper(fr, 11, fy + 7, 4, 7);
    arm(fr, 'armR', [
      [7, fy + 9],
      [9, fy + 12],
      [10, fy + 12],
    ]);
  }
}

/** Render all 21 frames for a cat: returns rows[dir][frame] = resolved cell grid. */
export function renderCatFrames(cat) {
  const rows = [];
  for (const dir of ['down', 'up', 'right']) {
    const frames = [];
    for (let i = 0; i < 7; i++) {
      const fr = new Frame();
      if (dir === 'right') right(fr, i, cat);
      else down(fr, i, cat, dir);
      frames.push(fr.finish());
    }
    rows.push(frames);
  }
  return rows;
}
