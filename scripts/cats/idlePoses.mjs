// Idle-activity poses: sipping coffee and napping curled up.
// Frames 7.. of every char_N.png row (see generate-cat-sprites.mjs). Drink
// frames follow the row direction; the curled nap looks the same from every
// side, so each row repeats it.

import { armAt, drawHead, drawTorso, leg, tail, Z } from './parts.mjs';

/** Above the head: a mug held to the mouth must cover the muzzle. */
const Z_LIFT = Z.head + 1;

const MUG_FRONT = ['UDDU.', 'UUUUU', 'UUUUU', 'KKKK.'];
const MUG_SIDE = ['.UDU', 'UUUU', 'UUUU', '.KKK'];
const MUG_BACK = ['UU', 'UU', 'KK'];

function mug(fr, rows, x, y, z) {
  fr.stamp(rows, x, y, 'mug', z, { rim: true });
}

const DRINK_FACE = {
  hold: {},
  sip: { eyes: 'closed' },
  blow: { eyes: 'half', mouth: 'o' },
  happy: { eyes: 'happy' },
};

function drinkDown(fr, mode, cat) {
  const fy = 10;
  const sip = mode === 'sip';
  drawHead(fr, 'down', 2, fy, cat, DRINK_FACE[mode]);
  if (mode === 'blow') {
    // Mug held up under the chin, just below the pursed mouth.
    mug(fr, MUG_FRONT, 6, fy + 8, Z_LIFT);
    armAt(
      fr,
      'armL',
      [
        [2, fy + 9],
        [3, fy + 9],
        [5, fy + 9],
      ],
      Z_LIFT,
    );
    armAt(
      fr,
      'armR',
      [
        [12, fy + 9],
        [11, fy + 9],
        [10, fy + 9],
      ],
      Z_LIFT,
    );
    drinkBody(fr, cat, fy);
    return;
  }
  drinkBody(fr, cat, fy);
  if (sip) {
    mug(fr, MUG_FRONT, 6, fy + 4, Z_LIFT);
    armAt(
      fr,
      'armL',
      [
        [2, fy + 9],
        [3, fy + 7],
        [4, fy + 5],
      ],
      Z_LIFT,
    );
    armAt(
      fr,
      'armR',
      [
        [12, fy + 9],
        [11, fy + 7],
        [10, fy + 5],
      ],
      Z_LIFT,
    );
    return;
  }
  mug(fr, MUG_FRONT, 6, fy + 10, Z.arm + 0.5);
  armAt(
    fr,
    'armL',
    [
      [2, fy + 9],
      [3, fy + 11],
      [4, fy + 11],
    ],
    Z.arm,
  );
  armAt(
    fr,
    'armR',
    [
      [12, fy + 9],
      [11, fy + 11],
      [10, fy + 11],
    ],
    Z.arm,
  );
}

/** Sitting body under a front-facing drinking head. */
function drinkBody(fr, cat, fy) {
  drawTorso(fr, 'down', 4, fy + 8);
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
}

function drinkUp(fr, mode, cat) {
  const sip = mode === 'sip';
  const fy = sip ? 7 : 8;
  drawHead(fr, 'up', 2, fy, cat);
  drawTorso(fr, 'up', 4, fy + 8);
  fr.rect(4, fy + 16, 8, 2, 'legL', Z.leg);
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
  const lift = sip ? 4 : mode === 'blow' ? 3 : 2;
  armAt(
    fr,
    'armL',
    [
      [2, fy + 9],
      [2, fy + 9 - lift],
    ],
    Z.arm,
  );
  armAt(
    fr,
    'armR',
    [
      [12, fy + 9],
      [12, fy + 9 - lift],
    ],
    Z.arm,
  );
  // Seen from behind only the mug's edge peeks out past the head.
  mug(fr, MUG_BACK, 13, sip ? fy + 3 : fy + 6, Z_LIFT);
}

function drinkRight(fr, mode, cat) {
  const fy = 9;
  const sip = mode === 'sip';
  drawHead(fr, 'right', 2, fy, cat, DRINK_FACE[mode]);
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
  if (mode === 'blow') {
    mug(fr, MUG_SIDE, 11, fy + 8, Z_LIFT);
    armAt(
      fr,
      'armR',
      [
        [7, fy + 9],
        [9, fy + 10],
        [10, fy + 9],
      ],
      Z_LIFT,
    );
    return;
  }
  if (sip) {
    mug(fr, MUG_SIDE, 11, fy + 4, Z_LIFT);
    armAt(
      fr,
      'armR',
      [
        [7, fy + 9],
        [9, fy + 8],
        [10, fy + 6],
      ],
      Z_LIFT,
    );
    return;
  }
  mug(fr, MUG_SIDE, 10, fy + 10, Z.arm + 0.5);
  armAt(
    fr,
    'armR',
    [
      [7, fy + 9],
      [8, fy + 11],
      [9, fy + 12],
    ],
    Z.arm,
  );
}

// ── Curled-up nap ───────────────────────────────────────────────────────
// Seen from the front and a little above: a round back, the head resting on
// the front paws at the left (eyes shut), the tail wrapped along the front.

const CURL_BODY = [
  '.....FFFFF....',
  '...FFhhhhhFF..',
  '..FFFFFFFFFFF.',
  '.FFFFFFFFFFFFF',
  'FFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFF',
  'fFFFFFFFFFFFFf',
  'ffFFFFFFFFFFff',
  '.ffffffffffff.',
];

const NAP_EARS = {
  pointed: ['F......F', 'FiF..FiF'],
  big: ['F......F', 'FiF..FiF', 'FiiFFiiF'],
};

const NAP_FACE = ['FFFhhFFF', 'FFFFFFFF', 'FmmFFmmF', 'fWWnnWWf', '.fWWWWf.'];

/**
 * breath: 0 = out, 1 = in (back rises 1 px). flick: the tail tip lifts.
 * twitch: the left ear tip folds (a dream twitch).
 */
export function curl(fr, cat, breath, flick, twitch = false) {
  const body = breath ? [CURL_BODY[0], ...CURL_BODY] : CURL_BODY;
  fr.stamp(body, 1, 29 - body.length + 1, 'curl', Z.torso, { dir: 'down' });
  let ears = NAP_EARS[cat.ears === 'big' ? 'big' : 'pointed'];
  if (twitch) ears = ['.......F', ...ears.slice(1)];
  const hy = 24;
  fr.stamp(ears, 2, hy - ears.length, 'head', Z.head, {
    rim: true,
    lyShift: -ears.length,
    dir: 'down',
  });
  fr.stamp(NAP_FACE, 2, hy, 'head', Z.head, { rim: true, dir: 'down' });
  // Front paws tucked under the chin.
  fr.stamp(['PP..PP'], 3, hy + 5, 'armL', Z.arm, { rim: true, dir: 'down' });
  const tip = flick ? [10, 29] : [10, 30];
  fr.stroke([[14, 25], [14, 28], [12, 30], tip], cat.tail === 'thin' ? 1 : 2, 'tail', Z.tailFront, {
    rim: true,
    tip: 2,
    tipLabel: 'tailTip',
    dir: 'down',
  });
}

function drink(mode) {
  return (fr, dir, cat) =>
    dir === 'down'
      ? drinkDown(fr, mode, cat)
      : dir === 'up'
        ? drinkUp(fr, mode, cat)
        : drinkRight(fr, mode, cat);
}

/** Named poses in sheet order (see poses.mjs). */
export const IDLE_POSES = [
  { name: 'drinkHold', draw: drink('hold') },
  { name: 'drinkSip', draw: drink('sip') },
  { name: 'napOut', draw: (fr, _d, cat) => curl(fr, cat, 0, false) },
  { name: 'napIn', draw: (fr, _d, cat) => curl(fr, cat, 1, false) },
  { name: 'napFlick', draw: (fr, _d, cat) => curl(fr, cat, 0, true) },
  { name: 'drinkBlow', draw: drink('blow') },
  { name: 'drinkHappy', draw: drink('happy') },
  { name: 'napTwitch', draw: (fr, _d, cat) => curl(fr, cat, 0, false, true) },
];
