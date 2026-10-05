// Shared body parts for every cat pose: heads, torso, limbs, tail, props.
// Coordinates are frame pixels; parts stamp semantic labels (see canvas.mjs).

// z-order: tail(back) < legs < torso < tail(front) < paper < arms < head
export const Z = { tailBack: 1, leg: 2, torso: 3, tailFront: 4, paper: 5, arm: 6, head: 7 };

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

/** opts.closedEyes: eyes become a content line (sipping, napping). */
export function drawHead(fr, dir, x, y, cat, opts = {}) {
  const earDir = dir === 'right' ? 'right' : 'down';
  let ears = EARS[earDir][cat.ears === 'big' ? 'big' : 'pointed'];
  const face = FACE[dir].slice();
  if (opts.closedEyes) {
    face[3] = face[3].replace(/[eE]/g, 'F');
    face[4] = face[4].replace(/[eE]/g, 'm');
  }
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

export function drawTorso(fr, dir, x, y) {
  fr.stamp(TORSO[dir], x, y, 'torso', Z.torso);
}

/** Vertical leg: fur column with a paw row at the bottom. */
export function leg(fr, part, x, yTop, yBot, w) {
  fr.rect(x, yTop, w, yBot - yTop, part, Z.leg);
  fr.rect(x, yBot, w, 1, part, Z.leg, 'paw');
}

export function arm(fr, part, pts, thick = 2, tip = 2) {
  fr.stroke(pts, thick, part, Z.arm, { rim: true, tip });
}

const TAIL_THICK = { thin: 1, normal: 2, bushy: 3 };

export function tail(fr, cat, pts, front) {
  const t = TAIL_THICK[cat.tail];
  // Bushy tails grow toward the body so they never leave the frame.
  const shifted = t === 3 ? pts.map(([px, py]) => [px - 1, py - 1]) : pts;
  fr.stroke(shifted, t, 'tail', front ? Z.tailFront : Z.tailBack, {
    rim: front,
    tip: 2,
    tipLabel: 'tailTip',
  });
}

export function paper(fr, x, y, w, h) {
  for (let r = 0; r < h; r++) {
    const ink = r % 2 === 1 && r < h - 1;
    const row = 'Q' + (ink ? 'q'.repeat(w - 3) + 'QQ' : 'Q'.repeat(w - 1));
    fr.stamp([row], x, y + r, 'paper', Z.paper, { rim: true, lyShift: r });
  }
}
