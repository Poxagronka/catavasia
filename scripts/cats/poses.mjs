// Pose definitions for the upright office cat.
// Sprite contract (see CLAUDE.md "Character sprites"): 16x32 frames, rows
// down / up / right, frames walk1 walk2 walk3 type1 type2 read1 read2.
// Feet sit on the bottom rows because the renderer anchors bottom-center.

import { Frame } from './canvas.mjs';
import { IDLE_FRAMES } from './idlePoses.mjs';
import { arm, drawHead, drawTorso, leg, paper, tail, Z } from './parts.mjs';

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

/** Render every frame for a cat: returns rows[dir][frame] = resolved cell grid.
 *  Frames 0-6 are the office poses, 7.. the idle-activity poses. */
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
    for (const draw of IDLE_FRAMES) {
      const fr = new Frame();
      draw(fr, dir, cat);
      frames.push(fr.finish());
    }
    rows.push(frames);
  }
  return rows;
}
