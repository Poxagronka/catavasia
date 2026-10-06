// Shared side-view bodies (facing right; left is mirrored at runtime) for the
// activity poses: sitting, standing on the hind legs, crouching low.

import { armAt, drawHead, drawTorso, leg, tail, Z } from './parts.mjs';

/** Above the head: a paw raised in front of the face covers the muzzle. */
export const Z_LIFT = Z.head + 1;
/** A far limb: behind the torso, darker. */
export const Z_FAR = Z.leg - 0.6;

/** A far (behind the body) front leg or arm, in the shade colour. */
export function farLimb(fr, pts, thick = 2) {
  fr.stroke(pts, thick, 'armL', Z_FAR, { tip: 2, label: 'shade' });
}

/** A near front leg or arm, drawn over the head when `over`. */
export function nearArm(fr, pts, over = false) {
  armAt(fr, 'armR', pts, over ? Z_LIFT : Z.arm);
}

/** Side sit body (facing right) from (1, fy + 8): round back, chest at the right. */
const SIT_BODY = [
  '....FFFFF..',
  '...CCCCCCC.',
  '..FFFFFFFWW',
  '.FFFFFFFFWW',
  '.FFFFFFFFWW',
  'FFFFFFFFFWW',
  'FFFFFFFFFFW',
  'fFFFFFFFFFW',
  'fFFFFFFFFF.',
  'fFFFFFFFFF.',
  'ffFFFFFFFf.',
  '.ffFFFFFf..',
  '..ffffff...',
];

/** The hind haunch: a round thigh resting on the floor, from (1, fy + 13). */
const HAUNCH = ['..hFFF..', '.hFFFFF.', 'FFFFFFFF', 'FFFFFFFF', 'fFFFFFFF', 'fFFFFFFF', '.ffffff.'];

/** Tail of a sit: wrapped along the floor around the front paws, or held up. */
const SIT_TAIL = {
  wrap: [
    [0, 26],
    [0, 28],
    [3, 29],
    [9, 29],
    [12, 29],
    [13, 28],
  ],
  up: [
    [1, 25],
    [0, 22],
    [0, 19],
    [1, 17],
  ],
};

/**
 * Sitting side-on: a round haunch on the floor, straight front legs, the
 * tail wrapped around the paws. The body always rests on the floor row 30.
 * head: drawHead options; headDx / headDy move the head only (a lean).
 * tail: 'wrap' (default), 'up', or 'flick' (up, the tip bent forward).
 * paw: true (both front legs on the floor), 'far' (the caller draws the near
 * one: a reach) or false (both paws up: holding a mug). Near shoulder: SIT_SHOULDER.
 */
export function sitSide(
  fr,
  cat,
  { head = {}, headDx = 0, headDy = 0, tail: tailKind = 'wrap', paw = true } = {},
) {
  const fy = 10;
  drawHead(fr, 'right', 3 + headDx, fy + headDy, cat, head);
  fr.stamp(SIT_BODY, 1, fy + 8, 'torso', Z.torso);
  fr.stamp(HAUNCH, 1, fy + 13, 'haunch', Z.torso + 0.3, { rim: true });
  // Hind paw: flat on the floor in front of the haunch.
  fr.rect(5, 30, 4, 1, 'haunch', Z.torso + 0.3, 'paw', { rim: true });
  // Far front leg: a shade sliver just past the near one.
  if (paw) {
    fr.rect(11, 25, 2, 5, 'legB', Z_FAR, 'shade');
    fr.rect(11, 30, 2, 1, 'legB', Z_FAR, 'paw');
  }
  if (paw === true) {
    fr.rect(9, 22, 2, 8, 'legF', Z.arm, 'fur', { rim: true });
    fr.rect(9, 30, 2, 1, 'legF', Z.arm, 'paw', { rim: true });
  }
  // Without front paws on the floor the wrap stops short of where they would stand.
  const wrap = paw ? SIT_TAIL.wrap : [...SIT_TAIL.wrap.slice(0, 3), [7, 29], [8, 28]];
  const pts =
    tailKind === 'wrap'
      ? wrap.map(([x, y]) => [x, cat.tail === 'thin' ? y + 1 : y])
      : tailKind === 'flick'
        ? [...SIT_TAIL.up.slice(0, 3), [2, 16]]
        : SIT_TAIL.up;
  tail(fr, cat, pts, tailKind === 'wrap');
}

/** Near front leg shoulder of sitSide (frame px), for callers that draw the arm. */
export const SIT_SHOULDER = [9, 20];

/**
 * Up on the hind legs, upright. fy: head top row. Hind legs reach the floor
 * at `floor` (lower it for a hop). Arms are left to the caller.
 */
export function standUp(fr, cat, { fy = 6, floor = 30, head = {}, tailPts, lean = 0 } = {}) {
  drawHead(fr, 'right', 2 + lean, fy, cat, head);
  drawTorso(fr, 'right', 4 + lean, fy + 8);
  const hip = fy + 15;
  fr.stroke(
    [
      [5, hip],
      [4, floor],
    ],
    2,
    'legB',
    Z.leg - 0.5,
    { tip: 1, label: 'shade' },
  );
  fr.stroke(
    [
      [7, hip],
      [8, floor],
    ],
    2,
    'legF',
    Z.leg,
    { tip: 1 },
  );
  tail(
    fr,
    cat,
    tailPts ?? [
      [4, hip - 1],
      [2, hip + 3],
      [1, floor - 1],
    ],
    false,
  );
}

/** Crouch body without legs: the haunch at the left, the back sloping down to the head. */
const CROUCH_BODY = [
  '..FFF......',
  '.FhhhF.....',
  'FFFFFFFF...',
  'fFFFFFFFFF.',
  'fFFFFFWWWW.',
  '.ffFFFWWW..',
];

/**
 * Low hunting crouch: belly near the floor, rear up by `rear` px (the butt
 * wiggle), head low at `hy`. flick: the tail tip leans by that many px.
 * paws: false when the caller draws the front paws.
 */
export function crouch(
  fr,
  cat,
  { hy = 19, rear = 0, head = { eyes: 'wide' }, flick = 0, paws = true } = {},
) {
  const by = 23 - rear;
  fr.stamp(CROUCH_BODY, 0, by, 'torso', Z.torso);
  // Hind leg: a short shin from the haunch to the floor (longer with the rear up).
  fr.rect(1, by + 6, 2, 30 - (by + 6), 'legB', Z.leg);
  fr.rect(1, 30, 3, 1, 'legB', Z.leg, 'paw');
  if (paws) {
    fr.rect(12, 29, 2, 1, 'armL', Z_FAR, 'shade');
    fr.rect(12, 30, 2, 1, 'armL', Z_FAR, 'paw');
    fr.rect(9, 29, 2, 1, 'legF', Z.leg + 0.2);
    fr.rect(9, 30, 2, 1, 'legF', Z.leg + 0.2, 'paw');
  }
  tail(
    fr,
    cat,
    [
      [1, by + 1],
      [0, by - 3],
      [1 + flick, by - 6],
    ],
    false,
  );
  drawHead(fr, 'right', 4, hy, cat, head);
}
