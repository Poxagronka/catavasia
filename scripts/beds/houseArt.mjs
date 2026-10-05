// Cat houses: hand-authored pixel templates drawn with the bed PALETTE.
// A cat sleeps INSIDE a house: the engine hides the cat and draws only its
// ears or its tail at `peek`. Openings use the near-black `x`, so the peeking
// ears or tail read clearly against them.

const EMPTY = '................';
const blank = (n) => Array(n).fill(EMPTY);

const CARDBOARD = [
  ...blank(5),
  '.......oo.......',
  '......otto......',
  '.....oBttbo.....',
  '....oBBttbbo....',
  '...oBBBttbbbo...',
  '..oBBBBttbbbbo..',
  '.oBBBBBttbbbbbo.',
  'oBBBBBBttbbbbbbo',
  'oooooooooooooooo',
  '.okkkkkkkkkkkko.',
  '.oBoooooooooobo.',
  '.oBoxxxxxxxxobo.',
  '.oBoxxxxxxxxobo.',
  '.oBoxxxxxxxxobo.',
  '.oBoxxxxxxxxobo.',
  '.oBoooooooooobo.',
  '.oBttttttttttbo.',
  '.oBBBBBBBBBBBbo.',
  '.oBBBBooooBBBbo.',
  '.oBBBoxxxxoBBbo.',
  '.oBBBoxxxxoBBbo.',
  '.oBBBoxxxxoBBbo.',
  '.oBBBoxxxxoBBbo.',
  '.oBBBoxxxxoBBbo.',
  '.obBBoxxxxoBbbo.',
  '.oooooooooooooo.',
  EMPTY,
];

const IGLOO = [
  ...blank(12),
  '.....oooooo.....',
  '...ooZZZKKKoo...',
  '..oZZZKKKKKKKo..',
  '.oZZKKKKKKKKKJo.',
  '.oZKKKKKKKKKKJo.',
  'oZKKKKKKKKKKKKJo',
  'oZKKKKKKKKKKKJJo',
  'oKKKKKKKKKKKKJJo',
  'oKKKKKooooKKKJJo',
  'oKKKKoxxxxoKKJJo',
  'oKKKoxxxxxxoKJJo',
  'oKKKoxxxxxxoJJJo',
  'oKKKoxxxxxxoJJJo',
  'oJKKoxxxxxxoJJJo',
  'oJKKoxxxxxxoJJJo',
  'oJJKoxxxxxxoJJJo',
  'oJJJoxxxxxxoJJJo',
  '.oJJoxxxxxxoJJo.',
  '..oooooooooooo..',
  EMPTY,
];

const PLANK = '.oWWWWWWWWWWwwo.';
const SEAM = '.ovvvvvvvvvvvvo.';
const DOOR_PLANK = '.oWWoxxxxxxoWwo.';
const DOOR_SEAM = '.ovvoxxxxxxovvo.';

const WOODEN = [
  ...blank(3),
  '.......oo.......',
  '......oRQo......',
  '.....oRRQQo.....',
  '....oRRooQQo....',
  '...oRRoWWoQQo...',
  '..oRRoWWWwoQQo..',
  '.oRRoWWWWwwoQQo.',
  'oRRoWWWWWwwwoQQo',
  'oooovvvvvvvvoooo',
  PLANK,
  PLANK,
  SEAM,
  PLANK,
  PLANK,
  SEAM,
  '.oWWWWooooWWwwo.',
  '.oWWWoxxxxoWwwo.',
  DOOR_SEAM,
  DOOR_PLANK,
  DOOR_PLANK,
  DOOR_SEAM,
  DOOR_PLANK,
  DOOR_PLANK,
  DOOR_SEAM,
  DOOR_PLANK,
  DOOR_PLANK,
  DOOR_SEAM,
  '.oooooooooooooo.',
  EMPTY,
];

/** One carpeted cube with a round hole (13 rows). */
const CUBE = [
  '.oooooooooooooo.',
  '.oLLLLLLLLLLLLo.',
  '.oCCCCCCCCCCCco.',
  '.oCCCooooooCCco.',
  '.oCCoxxxxxxoCco.',
  '.oCoxxxxxxxxoco.',
  '.oCoxxxxxxxxoco.',
  '.oCoxxxxxxxxoco.',
  '.oCCoxxxxxxoCco.',
  '.oCCCooooooCCco.',
  '.oCCCCCCCCCCCco.',
  '.occcccccccccco.',
  '.oooooooooooooo.',
];

const POST = '..oSso....oSso..';
const POST_BAND = '..orro....orro..';

const CONDO = [
  ...blank(10),
  ...CUBE,
  POST,
  POST,
  POST_BAND,
  POST,
  POST,
  POST_BAND,
  POST,
  POST,
  ...CUBE.slice(0, 12),
  'oooooooooooooooo',
  'oWWWWWWWWWWWWWWo',
  'owwwwwwwwwwwwwwo',
  'ovvvvvvvvvvvvvvo',
  '.oooooooooooooo.',
];

/**
 * `peek` is in sprite pixels from the top-left. It is the bottom-centre of
 * the peeking ears (about 7x3) or tail (about 6x4) sprite.
 */
export const HOUSES = [
  {
    id: 'HOUSE_CARDBOARD',
    name: 'Cardboard House',
    rows: CARDBOARD,
    fw: 1,
    fh: 2,
    bg: 1,
    peek: { kind: 'ears', x: 8, y: 20 },
  },
  {
    id: 'HOUSE_IGLOO',
    name: 'Felt Igloo',
    rows: IGLOO,
    fw: 1,
    fh: 2,
    bg: 1,
    peek: { kind: 'tail', x: 8, y: 30 },
  },
  {
    id: 'HOUSE_WOODEN',
    name: 'Wooden Cat House',
    rows: WOODEN,
    fw: 1,
    fh: 2,
    bg: 1,
    peek: { kind: 'tail', x: 8, y: 30 },
  },
  {
    id: 'HOUSE_CONDO',
    name: 'Cat Condo',
    rows: CONDO,
    fw: 1,
    fh: 3,
    bg: 2,
    peek: { kind: 'ears', x: 8, y: 18 },
  },
];
