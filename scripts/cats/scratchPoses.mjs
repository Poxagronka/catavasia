// Scratching post: up on the hind legs, front paws on the sisal column
// (frame x 13-15, below the platform at y 12-16), raking down one paw at a
// time; a long stretch with closed eyes; a happy look at the work.

import { Z } from './parts.mjs';
import { farLimb, nearArm, sitSide, standUp } from './sideKit.mjs';

/** Head top row of the upright scratch pose: the head stays under the platform. */
const FY = 12;

/** near / far: paw heights on the post (frame y). fy: head top row. */
function rake(fr, cat, near, far, { fy = FY, head = { eyes: 'half' } } = {}) {
  standUp(fr, cat, { fy, head, floor: 30 });
  const shoulder = fy + 9;
  farLimb(fr, [
    [9, shoulder],
    [12, far + 1],
    [14, far],
  ]);
  nearArm(fr, [
    [7, shoulder + 1],
    [10, near + 2],
    [13, near],
  ]);
  // Claws out on the near paw: one light pixel at the tip.
  fr.set(15, near, { label: 'whisker', part: 'claw', lx: 0, ly: 0, z: Z.head + 2 });
}

export const SCRATCH_POSES = [
  // Sitting at the post, looking up at it: the wind-up.
  { name: 'scrLook', draw: (fr, _d, cat) => sitSide(fr, cat, { head: { eyes: 'up' } }) },
  // Reaching up: both paws high, body long, eyes shut with the stretch.
  {
    name: 'scrReach',
    draw: (fr, _d, cat) => rake(fr, cat, 18, 17, { fy: 10, head: { eyes: 'closed' } }),
  },
  { name: 'scrA', draw: (fr, _d, cat) => rake(fr, cat, 19, 24) },
  { name: 'scrB', draw: (fr, _d, cat) => rake(fr, cat, 24, 19) },
  // Both paws pull down, body sinks: the follow-through.
  {
    name: 'scrPull',
    draw: (fr, _d, cat) => rake(fr, cat, 25, 24, { fy: 13, head: { eyes: 'happy' } }),
  },
];
