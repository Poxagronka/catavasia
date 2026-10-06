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

/** Eye columns of the face rows: [left eye x, right eye x] (front) or [eye x] (side). */
const EYE_X = { down: [2, 8], right: [8] };

/** [top row, bottom row] of the left eye (front) or the side eye; the right eye mirrors it. */
const EYES = {
  closed: ['FF', 'mm'],
  happy: ['mm', 'FF'],
  wide: ['wE', 'EE'],
  up: ['EE', 'ee'],
  down: ['ee', 'EE'],
  left: ['Ee', 'Ee'],
  right: ['eE', 'eE'],
  half: ['mm', 'eE'],
};

/** Mouth shapes as [x, face row, template char] cells. */
const MOUTHS = {
  down: {
    open: [
      [5, 6, 'r'],
      [6, 6, 'r'],
    ],
    o: [
      [5, 6, 'r'],
      [6, 6, 'r'],
      [5, 7, 'r'],
      [6, 7, 'r'],
    ],
    yawn: [
      [4, 6, 'r'],
      [5, 6, 'r'],
      [6, 6, 'r'],
      [7, 6, 'r'],
      [4, 7, 'r'],
      [5, 7, 't'],
      [6, 7, 't'],
      [7, 7, 'r'],
    ],
    tongue: [
      [5, 7, 't'],
      [6, 7, 't'],
    ],
  },
  right: {
    open: [
      [9, 6, 'r'],
      [10, 6, 'r'],
    ],
    o: [
      [10, 6, 'r'],
      [10, 7, 'r'],
    ],
    yawn: [
      [8, 6, 'r'],
      [9, 6, 'r'],
      [10, 6, 'r'],
      [8, 7, 'r'],
      [9, 7, 't'],
      [10, 7, 'r'],
    ],
    tongue: [
      [11, 6, 't'],
      [11, 7, 't'],
    ],
  },
};

function setChar(row, x, ch) {
  return row.slice(0, x) + ch + row.slice(x + 1);
}

/**
 * opts.closedEyes: eyes become a content line (sipping, napping).
 * opts.eyes: closed | happy | wide | up | down | left | right | half.
 * opts.mouth: open | o | yawn | tongue. opts.twitch: one ear tip folds.
 */
export function drawHead(fr, dir, x, y, cat, opts = {}) {
  const earDir = dir === 'right' ? 'right' : 'down';
  let ears = EARS[earDir][cat.ears === 'big' ? 'big' : 'pointed'];
  const face = FACE[dir].slice();
  const eyes = opts.closedEyes ? 'closed' : opts.eyes;
  if (eyes && dir !== 'up') {
    const [top, bot] = EYES[eyes];
    EYE_X[dir].forEach((ex, i) => {
      const flip = i === 1 && eyes !== 'left' && eyes !== 'right';
      const m = (s) => (flip ? [...s].reverse().join('') : s);
      face[3] = face[3].slice(0, ex) + m(top) + face[3].slice(ex + 2);
      face[4] = face[4].slice(0, ex) + m(bot) + face[4].slice(ex + 2);
    });
  }
  if (opts.mouth && dir !== 'up') {
    for (const [mx, my, ch] of MOUTHS[earDir][opts.mouth]) face[my] = setChar(face[my], mx, ch);
  }
  face[0] = EAR_ROW0[cat.ears === 'big' ? 'big' : 'pointed'][earDir];
  if (dir === 'up') {
    ears = ears.map((r) => r.replaceAll('i', 'f'));
    face[0] = face[0].replaceAll('i', 'f');
  }
  if (opts.twitch) {
    ears = ears.slice();
    ears[0] = dir === 'right' ? setChar(ears[0], 8, '.') : setChar(ears[0], 0, '.');
    ears[1] = dir === 'right' ? ears[1] : setChar(ears[1], 0, '.');
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

/** Arm drawn at an explicit depth (a raised arm sits over the chin). */
export function armAt(fr, part, pts, z) {
  fr.stroke(pts, 2, part, z, { rim: true, tip: 2 });
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
