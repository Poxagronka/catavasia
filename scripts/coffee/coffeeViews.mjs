// Extra views of the coffee machines, so the editor can rotate them (R).
// Same 7-frame contract as coffeeArt.mjs (0 idle, 1 on, 2-4 brewing,
// 5 done, 6 cup taken). MIT like the rest of the repo.
//
// "side" shows the working face (spout, cup, carafe) turned to the right; the
// catalog mirrors it for "left". "back" shows the rear panel: the cup is
// hidden there, so its frames show the power light, the water and the steam.
//
// The round pots (pour-over, French press, moka pot, kettle) look the same
// from the front and the back, so they get one more view only: the front
// art flipped (`flip`), which the catalog offers as a 2-way rotation.

import { frames } from './coffeeArt.mjs';

/** Every row reversed: the same item turned the other way. */
export function flip(rows) {
  return rows.map((r) => [...r].reverse().join(''));
}

/** Cells (x0..x1, y) set to ch. */
function span(x0, x1, y, ch) {
  const cells = [];
  for (let x = x0; x <= x1; x++) cells.push([x, y, ch]);
  return cells;
}

// ── Espresso machine, side: group head and cup on the right ─────────────
const ESPRESSO_SIDE = [
  '................',
  '.oooooooooo.....',
  '.oqqqqqqqqo.....',
  '.oRRRRRRRRo.....',
  '.oRrrrrrrRo.....',
  '.oRRRRRRRRoooo..',
  '.oRRRRRRRRonnoo.',
  '.oRRRRRRRRoMMoKo',
  '.oRRRRRRRRooMoo.',
  '.oRRRRRRRRo.....',
  '.oRRRRRRRRo.....',
  '.oRRRRRRRRoooo..',
  '.oRRRRRRRRoWWo..',
  '.oRRRRRRRRoWWoo.',
  '.oRmmmmmmmmmmmo.',
  '.oooooooooooooo.',
];
const ESP_SIDE_LEDS = [
  [3, 6, 'L'],
  [4, 6, 'L'],
];
const ESP_SIDE_STREAM = [
  [12, 9, 'C'],
  [12, 10, 'C'],
];
const ESP_SIDE_CUP_GONE = [
  ...span(11, 13, 11, '.'),
  ...span(11, 13, 12, '.'),
  ...span(11, 14, 13, '.'),
];
const ESPRESSO_SIDE_FRAMES = frames(ESPRESSO_SIDE, [
  [],
  [...ESP_SIDE_LEDS],
  [...ESP_SIDE_LEDS, ...ESP_SIDE_STREAM],
  [...ESP_SIDE_LEDS, ...ESP_SIDE_STREAM, ...span(11, 12, 13, 'C')],
  [...ESP_SIDE_LEDS, ...ESP_SIDE_STREAM, ...span(11, 12, 12, 'C'), ...span(11, 12, 13, 'C')],
  [...span(11, 12, 12, 'c'), ...span(11, 12, 13, 'C'), [12, 10, 's'], [11, 9, 's'], [13, 9, 's']],
  ESP_SIDE_CUP_GONE,
]);

// ── Espresso machine, back: water tank and vents ────────────────────────
const ESPRESSO_BACK = [
  '................',
  '..oooooooooooo..',
  '.oqqqqqqqqqqqqo.',
  '.oRRRRRRRRRRRRo.',
  '.oRrrrrrrrrrrRo.',
  '.oRRRRRRRRRRRRo.',
  '.oRRRmmmmmmRRRo.',
  '.oRRRmGGGGmRRRo.',
  '.oRRRmGGGGmRRRo.',
  '.oRRRmggggmRRRo.',
  '.oRRRmmmmmmRRRo.',
  '.oRRRRRRRRRRRRo.',
  '.oRRnRnRnRnRRRo.',
  '.oRRRRRRRRRRRRo.',
  '.oRRmmmmmmmmmRo.',
  '..ooooooooooooo.',
];
const ESP_BACK_LED = [[12, 12, 'L']];
const ESPRESSO_BACK_FRAMES = frames(ESPRESSO_BACK, [
  [],
  [...ESP_BACK_LED],
  [...ESP_BACK_LED, ...span(6, 9, 7, 'm'), [7, 0, 's']],
  [...ESP_BACK_LED, ...span(6, 9, 7, 'm'), [6, 0, 's'], [8, 0, 's']],
  [...ESP_BACK_LED, ...span(6, 9, 7, 'm'), ...span(6, 9, 8, 'm'), [7, 0, 's'], [9, 0, 's']],
  [...span(6, 9, 7, 'm'), ...span(6, 9, 8, 'm'), [7, 0, 's'], [8, 0, 's'], [9, 0, 's']],
  [...span(6, 9, 7, 'm'), ...span(6, 9, 8, 'm')],
]);

// ── Drip coffee maker, side: hood over the carafe on the right ──────────
const DRIP_SIDE = [
  '..ooooooooooo...',
  '..okkkkkkkkkko..',
  '..oKKKKKKKKKKo..',
  '..oKKKKKKKKKKo..',
  '..oKKKKooooooo..',
  '..oKKKKo.oo.....',
  '..oKKKKo........',
  '..oKKKKoooooo...',
  '..oKKKKoGGGGGo..',
  '..oKKKKoGggggoo.',
  '..oKKKKoGggggoGo',
  '..oKKKKoGggggoo.',
  '..oKKKKooGGGGo..',
  '..oKKKKnnnnnnno.',
  '..oooooooooooooo',
  '................',
];
const DRIP_SIDE_LED = [[5, 5, 'L']];
const DRIP_SIDE_STREAM = [[10, 6, 'C']];
/** Coffee in the carafe, `level` rows from the bottom. */
const DRIP_SIDE_POT = (level) => {
  const cells = [];
  for (let y = 11; y > 11 - level; y--) cells.push(...span(9, 12, y, 'C'));
  return cells;
};
const DRIP_SIDE_FRAMES = frames(DRIP_SIDE, [
  [],
  [...DRIP_SIDE_LED],
  [...DRIP_SIDE_LED, ...DRIP_SIDE_STREAM, ...DRIP_SIDE_POT(1)],
  [...DRIP_SIDE_LED, ...DRIP_SIDE_STREAM, ...DRIP_SIDE_POT(2)],
  [...DRIP_SIDE_LED, ...DRIP_SIDE_STREAM, ...DRIP_SIDE_POT(3)],
  [...DRIP_SIDE_LED, ...DRIP_SIDE_POT(3), [10, 6, 's'], [11, 5, 's']],
  [...DRIP_SIDE_LED, ...DRIP_SIDE_POT(2)],
]);

// ── Drip coffee maker, back: the water reservoir ────────────────────────
const DRIP_BACK = [
  '...ooooooooo....',
  '..okkkkkkkkko...',
  '..oKKKKKKKKKKo..',
  '..oKKKKKKKKKKo..',
  '..oKKjjjjjjKKo..',
  '..oKKjGGGGjKKo..',
  '..oKKjGGGGjKKo..',
  '..oKKjggggjKKo..',
  '..oKKjjjjjjKKo..',
  '..oKKKKKKKKKKo..',
  '..oKKKKKKKKKKo..',
  '..oKKKKKKKKKKo..',
  '..oKKKKKKKKKKo..',
  '..onnnnnnnnnnno.',
  '..oooooooooooooo',
  '................',
];
const DRIP_BACK_LED = [[11, 11, 'L']];
/** The reservoir drains from the top as the coffee brews. */
const DRAINED = (rows) => {
  const cells = [];
  for (let y = 5; y < 5 + rows; y++) cells.push(...span(6, 9, y, 'k'));
  return cells;
};
const DRIP_BACK_FRAMES = frames(DRIP_BACK, [
  [],
  [...DRIP_BACK_LED],
  [...DRIP_BACK_LED, ...DRAINED(1)],
  [...DRIP_BACK_LED, ...DRAINED(2)],
  [...DRIP_BACK_LED, ...DRAINED(3)],
  [...DRIP_BACK_LED, ...DRAINED(3), [4, 0, 's'], [5, 0, 's']],
  [...DRIP_BACK_LED, ...DRAINED(3)],
]);

/** Extra views per machine id: `side` (mirrored for "left") and `back`. */
export const EXTRA_VIEWS = {
  ESPRESSO_MACHINE: { side: ESPRESSO_SIDE_FRAMES, back: ESPRESSO_BACK_FRAMES },
  DRIP_COFFEE_MAKER: { side: DRIP_SIDE_FRAMES, back: DRIP_BACK_FRAMES },
};

/** The round pots: one flipped view each (see the header). */
export const FLIPPED_VIEW_IDS = ['POUR_OVER', 'FRENCH_PRESS', 'MOKA_POT', 'ELECTRIC_KETTLE'];
