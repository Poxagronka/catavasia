// Cat breeds: palette + optional coat pattern + silhouette traits.
// A pattern gets one resolved cell ({label, part, lx, ly, len}) and the view
// direction, and returns a palette key to override the default, or null.
// Patterns use part-local coordinates so markings stay put while animating.

const OUTLINE = [46, 28, 32];
const DARK_OUTLINE = [16, 12, 20];

const FURRY = new Set(['fur', 'shade', 'light', 'paw', 'tailTip']);

function hash(...n) {
  let h = 2166136261;
  for (const v of n)
    h = Math.imul(h ^ (typeof v === 'string' ? v.length * 31 + v.charCodeAt(0) : v + 7), 16777619);
  return (h >>> 0) % 1000;
}

const isLimb = (part) => part.startsWith('arm') || part.startsWith('leg');

/** Classic tabby: forehead "M", striped back, ringed limbs and tail. */
function tabby(c, dir) {
  if (!FURRY.has(c.label)) return null;
  const { part, lx, ly } = c;
  if (part === 'head') {
    if (dir === 'down')
      return ((lx === 3 || lx === 8) && ly >= 0 && ly <= 2) ||
        ((lx === 5 || lx === 6) && ly === 0) ||
        ((lx === 1 || lx === 10) && ly === 5)
        ? 'stripe'
        : null;
    if (dir === 'up')
      return ((lx === 3 || lx === 8) && ly >= 1 && ly <= 6) ||
        ((lx === 5 || lx === 6) && ly >= 1 && ly <= 4)
        ? 'stripe'
        : null;
    return ((lx === 3 || lx === 5) && ly >= 0 && ly <= 2) ||
      (lx === 2 && ly === 4) ||
      (lx === 3 && ly === 5)
      ? 'stripe'
      : null;
  }
  if (part === 'torso') {
    if (dir === 'right') return ly >= 2 && ly % 2 === 0 && lx <= 2 ? 'stripe' : null;
    if (dir === 'up') return ly >= 3 && ly % 2 === 1 && lx >= 1 && lx <= 6 ? 'stripe' : null;
    return ly >= 3 && ly % 2 === 1 && (lx <= 1 || lx >= 6) ? 'stripe' : null;
  }
  if (part === 'tail') return c.label === 'tailTip' || c.ly % 3 === 1 ? 'stripe' : null;
  if (isLimb(part) && c.label === 'fur') return c.ly % 3 === 1 ? 'stripe' : null;
  return null;
}

function calico(c, dir) {
  if (!FURRY.has(c.label) || c.label === 'paw') return null;
  const { part, lx, ly } = c;
  const shade = c.label === 'shade' ? 'Shade' : '';
  if (part === 'head') {
    const orange = dir === 'right' ? lx >= 5 && ly <= 3 : lx <= 5 && ly <= 3;
    const black = dir === 'right' ? lx <= 3 && ly <= 5 : lx >= 7 && ly <= 4;
    if (orange) return 'patchA' + shade;
    if (black) return 'patchB' + shade;
    return null;
  }
  const h = hash(
    part.length,
    part.charCodeAt(part.length - 1),
    Math.floor(lx / 3),
    Math.floor((ly + 1) / 3),
  );
  if (part === 'tail') return c.ly % 4 < 2 ? 'patchB' : 'patchA';
  if (h < 300) return 'patchA' + shade;
  if (h < 520) return 'patchB' + shade;
  return null;
}

function tortie(c, dir) {
  if (!FURRY.has(c.label) && c.label !== 'belly') return null;
  const { part, lx, ly } = c;
  // Split face: one half ginger, one half black, a classic tortie look.
  if (part === 'head' && dir === 'down') {
    const ginger = lx <= 5;
    const h = hash(lx, ly, 3);
    if (ginger) return h < 750 ? 'patchA' : 'patchB';
    return h < 850 ? null : 'patchA';
  }
  const h = hash(part.length, part.charCodeAt(part.length - 1), Math.floor(lx / 2), ly);
  if (h < 300) return 'patchA';
  if (h < 420) return 'patchB';
  return null;
}

function siamese(c, dir) {
  const { part, lx, ly, label } = c;
  if (label === 'earIn') return 'pointShade';
  if (!FURRY.has(label) && label !== 'belly') return null;
  if (part === 'head') {
    if (ly < 0 || (dir !== 'up' && ly >= 0 && ly <= 0 && (lx <= 2 || lx >= 9))) return 'point';
    if (dir === 'down' && ly >= 3 && lx >= 2 && lx <= 9) return 'point';
    if (dir === 'right' && ly >= 3 && lx >= 6) return 'point';
    return null;
  }
  if (part === 'tail') return 'point';
  if (part.startsWith('arm')) return c.ly >= c.len - 3 ? 'point' : null;
  if (part.startsWith('leg')) return 'point';
  return null;
}

function tuxedo(c, dir) {
  if (c.part === 'head' && dir === 'down' && (c.lx === 5 || c.lx === 6) && c.ly >= 1 && c.ly <= 2)
    return 'belly';
  return null;
}

function bengal(c) {
  if (!['fur', 'shade', 'light'].includes(c.label)) return null;
  const { part, lx, ly } = c;
  const seed = part.length;
  if (part === 'tail') return c.ly % 3 === 0 ? 'stripe' : null;
  if (part === 'head') return ly >= 0 && ly <= 2 && (lx + ly * 2) % 4 === 0 ? 'stripe' : null;
  if ((lx + 2 * ly + seed) % 4 === 0 && ly % 2 === 0) return 'stripe';
  if ((lx + 2 * ly + seed) % 4 === 1 && ly % 2 === 0) return 'spotIn';
  return null;
}

function sphynx(c, dir) {
  const { part, lx, ly, label } = c;
  // Hairless cats get cold: a knitted sweater over the torso.
  if (part === 'torso') {
    if (label === 'collar') return 'rib';
    if (['fur', 'shade', 'light', 'belly'].includes(label))
      return ly % 3 === 0 ? 'knit' : 'sweater';
  }
  if (part === 'head' && dir === 'down' && ly === 1 && lx >= 4 && lx <= 7) return 'shade';
  if (part === 'head' && dir === 'right' && ly === 1 && lx >= 3 && lx <= 5) return 'shade';
  return null;
}

const base = {
  outline: OUTLINE,
  pupil: [24, 16, 20],
  nose: [232, 128, 136],
  earIn: [240, 160, 160],
  whisker: [236, 232, 226],
  paper: [238, 234, 222],
  ink: [96, 104, 130],
  tag: [246, 200, 60],
  collar: null,
};

/** Order = char_N index. char_0 is also the Intro greeter. */
export const BREEDS = [
  {
    name: 'Marmalade',
    breed: 'ginger tabby',
    pattern: tabby,
    fur: [222, 132, 58],
    shade: [186, 98, 40],
    light: [240, 168, 96],
    belly: [248, 218, 170],
    stripe: [158, 70, 28],
    eye: [120, 200, 80],
    collar: [40, 110, 200],
  },
  {
    name: 'Smokey',
    breed: 'grey tabby',
    pattern: tabby,
    fur: [148, 150, 160],
    shade: [116, 118, 130],
    light: [184, 186, 194],
    belly: [228, 228, 232],
    stripe: [64, 66, 80],
    eye: [206, 192, 60],
    collar: [204, 48, 60],
  },
  {
    name: 'Shadow',
    breed: 'black',
    fur: [54, 48, 62],
    shade: [38, 34, 46],
    light: [88, 80, 100],
    belly: [66, 60, 76],
    outline: DARK_OUTLINE,
    eye: [244, 204, 60],
    nose: [92, 62, 72],
    earIn: [112, 82, 96],
    collar: [214, 40, 52],
  },
  {
    name: 'Snow',
    breed: 'white (odd-eyed)',
    fur: [242, 242, 246],
    shade: [206, 210, 222],
    light: [255, 255, 255],
    belly: [255, 255, 255],
    eye: [86, 158, 240],
    eye2: [232, 190, 60],
    nose: [248, 150, 160],
    earIn: [250, 172, 182],
    outline: [78, 66, 80],
    collar: [232, 104, 172],
  },
  {
    name: 'Tux',
    breed: 'tuxedo',
    pattern: tuxedo,
    fur: [40, 38, 48],
    shade: [28, 26, 34],
    light: [72, 70, 86],
    belly: [250, 250, 250],
    paw: [250, 250, 250],
    outline: DARK_OUTLINE,
    eye: [140, 210, 90],
    nose: [240, 150, 160],
    earIn: [112, 82, 96],
    collar: [222, 40, 40],
  },
  {
    name: 'Patches',
    breed: 'calico',
    pattern: calico,
    fur: [246, 242, 236],
    shade: [214, 208, 200],
    light: [255, 252, 248],
    belly: [252, 250, 246],
    patchA: [228, 136, 58],
    patchAShade: [190, 102, 42],
    patchB: [52, 46, 56],
    patchBShade: [36, 32, 40],
    eye: [230, 180, 60],
    collar: [70, 176, 110],
  },
  {
    name: 'Tortie',
    breed: 'tortoiseshell',
    pattern: tortie,
    fur: [56, 40, 40],
    shade: [40, 28, 30],
    light: [76, 56, 52],
    belly: [64, 46, 44],
    patchA: [206, 110, 46],
    patchB: [138, 66, 36],
    paw: [64, 46, 44],
    outline: DARK_OUTLINE,
    eye: [228, 176, 50],
    nose: [120, 70, 70],
    earIn: [140, 90, 90],
    collar: [60, 168, 210],
  },
  {
    name: 'Mochi',
    breed: 'siamese',
    pattern: siamese,
    fur: [244, 230, 206],
    shade: [220, 202, 172],
    light: [252, 244, 228],
    belly: [250, 240, 222],
    paw: [92, 62, 50],
    point: [96, 64, 52],
    pointShade: [70, 46, 38],
    eye: [80, 150, 240],
    nose: [70, 46, 38],
    collar: [150, 90, 206],
  },
  {
    name: 'Nikolai',
    breed: 'russian blue',
    fur: [124, 138, 160],
    shade: [98, 110, 132],
    light: [168, 180, 200],
    belly: [142, 156, 178],
    eye: [86, 206, 112],
    nose: [86, 88, 108],
    earIn: [150, 140, 162],
    collar: [232, 182, 50],
  },
  {
    name: 'Butterscotch',
    breed: 'cream tabby',
    pattern: tabby,
    fur: [242, 212, 160],
    shade: [216, 182, 128],
    light: [252, 232, 194],
    belly: [252, 242, 218],
    stripe: [214, 166, 104],
    eye: [222, 136, 46],
    collar: [112, 196, 176],
  },
  {
    name: 'Leo',
    breed: 'bengal',
    pattern: bengal,
    fur: [216, 162, 80],
    shade: [182, 128, 58],
    light: [234, 192, 112],
    belly: [246, 226, 182],
    paw: [246, 226, 182],
    stripe: [74, 46, 28],
    spotIn: [150, 96, 46],
    eye: [104, 186, 82],
  },
  {
    name: 'Dobby',
    breed: 'sphynx',
    pattern: sphynx,
    ears: 'big',
    tail: 'thin',
    whiskers: false,
    fur: [232, 184, 170],
    shade: [204, 150, 140],
    light: [244, 206, 194],
    belly: [240, 196, 184],
    paw: [240, 196, 184],
    sweater: [128, 82, 172],
    knit: [168, 122, 210],
    rib: [96, 60, 134],
    eye: [156, 212, 88],
    nose: [214, 120, 128],
    earIn: [222, 140, 146],
  },
  {
    name: 'Bear',
    breed: 'maine coon',
    pattern: tabby,
    ears: 'tufted',
    tail: 'bushy',
    ruff: true,
    fur: [138, 98, 64],
    shade: [108, 74, 48],
    light: [174, 132, 90],
    belly: [232, 216, 192],
    stripe: [54, 36, 26],
    eye: [212, 172, 62],
  },
].map((b) => ({ ears: 'pointed', tail: 'normal', whiskers: true, ruff: false, ...base, ...b }));

/** Resolve one cell to RGBA for a breed. */
export function colorize(breed, cell, dir) {
  if (!cell) return [0, 0, 0, 0];
  const pick = (key) => [...(breed[key] ?? breed.fur), 255];
  switch (cell.label) {
    case 'outline':
    case 'line':
      return pick('outline');
    case 'whisker':
    case 'paper':
    case 'ink':
    case 'pupil':
    case 'tag':
      return pick(cell.label);
    default:
      break;
  }
  const over = breed.pattern?.(cell, dir);
  if (over) return pick(over);
  switch (cell.label) {
    case 'eye':
      return pick(breed.eye2 && cell.lx >= 6 && dir === 'down' ? 'eye2' : 'eye');
    case 'collar':
      return breed.collar ? pick('collar') : pick('fur');
    case 'paw':
      return pick(breed.paw ? 'paw' : 'light');
    case 'tailTip':
      return pick('fur');
    default:
      return pick(cell.label);
  }
}
