// Cardboard box (front view): the cat hops in, sinks down until only its
// ears and eyes show over the rim, blinks, looks around, twitches an ear and
// pops up again. The box front (rows 7.. of BOX_ROWS) is part of the frame so
// it hides the cat's body; a hop frame has no box (it moves with dy).

import { BOX_ROWS } from '../toys/toyArt.mjs';
import { drawHead, drawTorso, tail, Z } from './parts.mjs';

const Z_LIFT = Z.head + 1;
/** The box fills the bottom tile of the frame. */
const TOP = 16;

/** Head top row `hy` behind the box front; paws on the rim when `paws`. */
function inBox(fr, cat, hy, head = {}, paws = false) {
  fr.stampProp(BOX_ROWS, 0, TOP, Z.tailBack, (r) => r < 7);
  drawHead(fr, 'down', 2, hy, cat, head);
  if (hy <= 14) drawTorso(fr, 'down', 4, hy + 8);
  fr.stampProp(BOX_ROWS, 0, TOP, Z_LIFT + 1, (r) => r >= 7);
  // Whiskers below the rim are inside the box.
  fr.overlay = fr.overlay.filter(([, y]) => y < TOP + 7);
  if (paws) fr.stamp(['PP....PP'], 4, TOP + 6, 'armL', Z_LIFT + 2, { rim: true, dir: 'down' });
}

/** In the air above the box, legs tucked, tail up (no box in the frame). */
function hop(fr, cat) {
  drawHead(fr, 'down', 2, 6, cat, { eyes: 'happy' });
  drawTorso(fr, 'down', 4, 14);
  fr.stamp(['PP..PP'], 5, 22, 'armL', Z.arm, { rim: true, dir: 'down' });
  tail(
    fr,
    cat,
    [
      [10, 20],
      [13, 18],
      [14, 14],
    ],
    false,
  );
}

export const BOX_POSES = [
  { name: 'boxHop', draw: (fr, _d, cat) => hop(fr, cat) },
  { name: 'boxSink', draw: (fr, _d, cat) => inBox(fr, cat, 12, { eyes: 'happy' }, true) },
  { name: 'boxPeek', draw: (fr, _d, cat) => inBox(fr, cat, 14, {}, true) },
  { name: 'boxLow', draw: (fr, _d, cat) => inBox(fr, cat, 18, { eyes: 'wide' }) },
  { name: 'boxBlink', draw: (fr, _d, cat) => inBox(fr, cat, 18, { eyes: 'closed' }) },
  { name: 'boxLookL', draw: (fr, _d, cat) => inBox(fr, cat, 18, { eyes: 'left' }) },
  { name: 'boxLookR', draw: (fr, _d, cat) => inBox(fr, cat, 18, { eyes: 'right' }) },
  { name: 'boxTwitch', draw: (fr, _d, cat) => inBox(fr, cat, 18, { eyes: 'wide', twitch: true }) },
];
