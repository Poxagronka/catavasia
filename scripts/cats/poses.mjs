// Pose definitions for the upright office cat.
// Sprite contract (see CLAUDE.md "Character sprites"): 16x32 frames, rows
// down / up / right, frames walk1 walk2 walk3 type1 type2 read1 read2.
// Feet sit on the bottom rows because the renderer anchors bottom-center.

import { Frame } from './canvas.mjs';
import { IDLE_POSES } from './idlePoses.mjs';
import { down, right } from './officePoses.mjs';
import { REST_POSES } from './restPoses.mjs';
import { SOCIAL_POSES } from './socialPoses.mjs';
import { WORK_POSES } from './workPoses.mjs';
import { TOY_POSES } from './toyPoses.mjs';

/**
 * Activity poses after the 7 office frames, in sheet order. Each draws one
 * frame for a row direction; side poses ignore it (left is mirrored at runtime).
 * The webview names frames through POSE_NAMES, so new poses append freely.
 */
export const POSES = [...IDLE_POSES, ...TOY_POSES, ...REST_POSES, ...WORK_POSES, ...SOCIAL_POSES];

/** Pose names in sheet order: sheet frame = 7 + index. */
export const POSE_NAMES = POSES.map((p) => p.name);

/** Render every frame for a cat: returns rows[dir][frame] = resolved cell grid.
 *  Frames 0-6 are the office poses, 7.. the activity poses (POSES). */
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
    for (const pose of POSES) {
      const fr = new Frame();
      pose.draw(fr, dir, cat);
      frames.push(fr.finish());
    }
    rows.push(frames);
  }
  return rows;
}
