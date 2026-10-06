// Palette and drawing helpers of the Cat CEO office art (executiveArt.mjs).
// MIT like the rest of the repo.

export const PALETTE = {
  '.': [0, 0, 0, 0],
  o: [38, 16, 14, 255], // outline
  d: [62, 24, 20, 255], // deep mahogany (recess, shadow)
  m: [88, 34, 26, 255], // dark mahogany (front panel)
  M: [118, 46, 32, 255], // mahogany (top)
  H: [152, 70, 46, 255], // polish highlight
  h: [194, 112, 78, 255], // gloss streak
  G: [226, 178, 64, 255], // gold
  g: [164, 116, 36, 255], // dark gold
  y: [255, 236, 150, 255], // gold glint
  L: [40, 92, 60, 255], // green leather
  l: [26, 60, 40, 255], // dark green leather
  E: [74, 138, 92, 255], // green leather highlight
  e: [255, 226, 128, 255], // lamp glow
  B: [64, 120, 186, 255], // globe sea
  b: [40, 78, 132, 255], // globe sea shade
  V: [110, 168, 84, 255], // globe land
  W: [238, 232, 216, 255], // paper
  w: [196, 186, 166, 255], // paper shade
  R: [124, 30, 34, 255], // oxblood leather
  r: [84, 18, 24, 255], // leather crease
  q: [170, 62, 58, 255], // leather highlight
  Q: [204, 104, 92, 255], // leather gloss
  K: [44, 40, 48, 255], // chair base steel
  k: [92, 88, 100, 255], // steel highlight
  s: [0, 0, 0, 64], // soft shadow
};

/** A blank w x h grid of '.' with drawing helpers. */
export function canvas(w, h) {
  const px = Array.from({ length: h }, () => Array(w).fill('.'));
  const set = (x, y, c) => {
    if (y >= 0 && y < h && x >= 0 && x < w) px[y][x] = c;
  };
  return {
    set,
    rect(x0, y0, x1, y1, c) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c);
    },
    hline(x0, x1, y, c) {
      for (let x = x0; x <= x1; x++) set(x, y, c);
    },
    vline(x, y0, y1, c) {
      for (let y = y0; y <= y1; y++) set(x, y, c);
    },
    dots(cells, c) {
      for (const [x, y] of cells) set(x, y, c);
    },
    /** Outline box: border c, fill f. */
    box(x0, y0, x1, y1, c, f) {
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++)
          set(x, y, y === y0 || y === y1 || x === x0 || x === x1 ? c : f);
    },
    /** Template rows at (x, y); '.' leaves the pixel below. */
    stamp(x, y, lines) {
      lines.forEach((line, dy) =>
        [...line].forEach((ch, dx) => ch !== '.' && set(x + dx, y + dy, ch)),
      );
    },
    rows: () => px.map((r) => r.join('')),
  };
}
