// Cat beds: hand-authored pixel templates (MIT, like the repo).
// One character = one pixel. PALETTE extends the toy palette, so the shared
// outline and the cardboard, wood, carpet and sisal tones match the toys.
// Houses (houseArt.mjs) draw with the same PALETTE.

import { PALETTE as TOY_PALETTE } from '../toys/toyArt.mjs';

export const PALETTE = {
  ...TOY_PALETTE,
  A: [156, 190, 136, 255], // sage cushion
  g: [198, 224, 172, 255],
  a: [114, 150, 102, 255],
  d: [80, 110, 74, 255],
  H: [222, 176, 108, 255], // wicker
  h: [186, 136, 76, 255],
  j: [134, 90, 52, 255],
  E: [240, 240, 244, 255], // radiator
  N: [200, 204, 216, 255],
  O: [150, 154, 172, 255],
  D: [184, 124, 172, 255], // hammock fabric
  '#': [140, 88, 134, 255],
  l: [100, 60, 100, 255],
  U: [236, 224, 210, 255], // donut plush
  V: [200, 184, 168, 255],
  X: [156, 136, 124, 255],
  K: [118, 140, 170, 255], // felt igloo
  J: [86, 104, 134, 255],
  Z: [158, 180, 206, 255],
};

const EMPTY = '................';

const CUSHION = [
  EMPTY,
  EMPTY,
  EMPTY,
  EMPTY,
  '.....oooooo.....',
  '...ooggggggoo...',
  '..ogAAAAAAAAgo..',
  '.ogAAaAAAAaAAAo.',
  '.oAaAAAAAAAAaAo.',
  '.oAAAAAddAAAAAo.',
  '.oAaAAAAAAAAaAo.',
  '.oaAAAaAAaAAAao.',
  '.oddddddddddddo.',
  '..oaaaaaaaaaao..',
  '...oooooooooo...',
  EMPTY,
];

const BASKET = [
  EMPTY,
  EMPTY,
  EMPTY,
  EMPTY,
  '....oooooooo....',
  '..ooHhHhHhHhoo..',
  '.oHhooooooooHho.',
  '.oHoIIIIIIiIoHo.',
  '.ohoIiIIIIIIoho.',
  '.oHoiIIIIiiIoHo.',
  '.ohHooooooooHho.',
  '.oHhHhHhHhHhHho.',
  '.ojHHjHHjHHjHjo.',
  '..ojhhjhhjhhjo..',
  '...oooooooooo...',
  EMPTY,
];

const FINS = '.oENOENOENOENOo.';
const STRAPPED_FINS = '.oElOENOENOElOo.';

const HAMMOCK = [
  EMPTY,
  EMPTY,
  EMPTY,
  EMPTY,
  '...o........o...',
  '..olo......olo..',
  '..oloooooooolo..',
  '.oElEEEEEEEElEo.',
  ...Array(8).fill(STRAPPED_FINS),
  '.oooooooooooooo.',
  'oDllllllllllllDo',
  'oDDllllllllllDDo',
  'oDDDDDDDDDDDDDDo',
  '.o#DDDDDDDDDD#o.',
  '.o#DDDDDDDDDD#o.',
  '.oo#DDDDDDDD#oo.',
  '.oEo########oOo.',
  '.oENooooooooNOo.',
  FINS,
  FINS,
  FINS,
  '.oOOOOOOOOOOOOo.',
  '..oooooooooooo..',
  '..oOo......oOo..',
  '..ooo......ooo..',
];

const DONUT = [
  EMPTY,
  EMPTY,
  EMPTY,
  '....oo.oo.oo....',
  '...oUUoUUoUUo...',
  '..oUUUUUUUUUUo..',
  '.ooUUVVVVVVUUoo.',
  'oUUUVXXXXXXVUUUo',
  '.oUVXXVVVVXXVUo.',
  'oUUVXVVVVVVXVUUo',
  '.oUUVVVVVVVVUUo.',
  'oVUUUVVVVVVUUUVo',
  '.oVUUUUUUUUUUVo.',
  'oVVVUUUUUUUUVVVo',
  '.ooVVoVVVVoVVoo.',
  '...oo.oooo.oo...',
];

/**
 * A cat curls up ON a bed. `sleep` is where the engine puts the cat's
 * bottom-centre, relative to the centre of the bottom-left footprint tile.
 */
export const BEDS = [
  {
    id: 'BED_CUSHION',
    name: 'Round Cushion',
    rows: CUSHION,
    fw: 1,
    fh: 1,
    bg: 0,
    sleep: { offsetX: 0, offsetY: 4 },
  },
  {
    id: 'BED_BASKET',
    name: 'Wicker Basket',
    rows: BASKET,
    fw: 1,
    fh: 1,
    bg: 0,
    sleep: { offsetX: 0, offsetY: 4 },
  },
  {
    id: 'BED_HAMMOCK',
    name: 'Radiator Hammock',
    rows: HAMMOCK,
    fw: 1,
    fh: 2,
    bg: 1,
    sleep: { offsetX: 0, offsetY: -3 },
  },
  {
    id: 'BED_DONUT',
    name: 'Donut Bed',
    rows: DONUT,
    fw: 1,
    fh: 1,
    bg: 0,
    sleep: { offsetX: 0, offsetY: 4 },
  },
];
