// Toy poses, one module per toy: scratching post, yarn and toy mouse
// (hunting), feather teaser, cardboard box, cat tree. Side poses face right
// (left is mirrored at runtime) and repeat in every sheet row; the box and
// tree poses face the viewer.

import { BOX_POSES } from './boxPoses.mjs';
import { HUNT_POSES } from './huntPoses.mjs';
import { SCRATCH_POSES } from './scratchPoses.mjs';
import { TEASER_POSES } from './teaserPoses.mjs';
import { TREE_POSES } from './treePoses.mjs';

/** Named poses in sheet order (see poses.mjs). */
export const TOY_POSES = [
  ...SCRATCH_POSES,
  ...HUNT_POSES,
  ...TEASER_POSES,
  ...BOX_POSES,
  ...TREE_POSES,
];
