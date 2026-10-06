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

/**
 * Sitting side-on. dy: whole body offset. tailPts: the tail path (default
 * curled on the floor behind). head: drawHead options. Arms are left to the
 * caller (none drawn here) unless `paw` is true (resting front paw).
 */
export function sitSide(
  fr,
  cat,
  { dy = 0, head = {}, headDx = 0, headDy = 0, tailPts, paw = true } = {},
) {
  const fy = 9 + dy;
  drawHead(fr, 'right', 2 + headDx, fy + headDy, cat, head);
  drawTorso(fr, 'right', 5, fy + 8);
  fr.rect(7, 26 + dy, 5, 2, 'legF', Z.leg);
  leg(fr, 'legF', 10, 28 + dy, 29 + dy, 2);
  tail(
    fr,
    cat,
    tailPts ?? [
      [5, 25 + dy],
      [3, 25 + dy],
      [2, 23 + dy],
      [2, 21 + dy],
    ],
    false,
  );
  if (paw)
    nearArm(fr, [
      [7, fy + 9],
      [9, fy + 13],
      [10, fy + 16],
    ]);
}

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
