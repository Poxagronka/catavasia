// Feather teaser: the feather hangs at frame x 12-16, y 14-21 in front of
// the cat (facing right). The cat watches it, rears up, swats with one paw
// then the other, and hops up after it.

import { farLimb, nearArm, sitSide, standUp } from './sideKit.mjs';

/** Up on the hind legs with the paws at `near` / `far` ([x, y]). */
function rear(fr, cat, near, far, { fy = 7, floor = 30, head = { eyes: 'wide' } } = {}) {
  standUp(fr, cat, { fy, floor, head });
  const sh = fy + 9;
  farLimb(fr, [[9, sh], far]);
  nearArm(
    fr,
    [[7, sh + 1], [Math.round((7 + near[0]) / 2), Math.round((sh + near[1]) / 2)], near],
    true,
  );
}

export const TEASER_POSES = [
  { name: 'teaserWatch', draw: (fr, _d, cat) => sitSide(fr, cat, { head: { eyes: 'right' } }) },
  {
    name: 'teaserWatchUp',
    draw: (fr, _d, cat) => sitSide(fr, cat, { head: { eyes: 'up' }, tail: 'up' }),
  },
  { name: 'teaserRear', draw: (fr, _d, cat) => rear(fr, cat, [12, 13], [13, 12]) },
  {
    name: 'teaserSwatA',
    draw: (fr, _d, cat) =>
      rear(fr, cat, [15, 15], [10, 18], { head: { eyes: 'wide', mouth: 'open' } }),
  },
  { name: 'teaserSwatB', draw: (fr, _d, cat) => rear(fr, cat, [10, 19], [15, 14]) },
  {
    name: 'teaserHop',
    draw: (fr, _d, cat) =>
      rear(fr, cat, [14, 11], [15, 13], {
        fy: 4,
        floor: 27,
        head: { eyes: 'wide', mouth: 'open' },
      }),
  },
  {
    name: 'teaserGotIt',
    draw: (fr, _d, cat) => rear(fr, cat, [14, 16], [14, 17], { head: { eyes: 'happy' } }),
  },
];
