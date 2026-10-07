// RGBA drawing helpers of the legendary paintings (paintingArt modules).
// Paintings need soft blends (feathered edges, translucent water), so they draw
// colors directly instead of the palette letters of the other generators.
// MIT like the rest of the repo.

/** Linear mix of two [r, g, b] colors; t = 0 gives a, t = 1 gives b. */
export function mix(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

/** A stable pseudo-random value in [0, 1) per pixel, so every run draws the same art. */
export function noise(x, y, seed = 0) {
  let n = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** A transparent w x h RGBA canvas. */
export function canvas(w, h) {
  const data = new Uint8Array(w * h * 4);
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const get = (x, y) => {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const set = (x, y, rgb) => {
    if (!inside(x, y)) return;
    data.set([...rgb, 255], (y * w + x) * 4);
  };
  return {
    w,
    h,
    data,
    get,
    set,
    /** Mix rgb over the pixel that is there by t (0..1). */
    blend(x, y, rgb, t) {
      if (inside(x, y)) set(x, y, mix(get(x, y), rgb, t));
    },
    rect(x0, y0, x1, y1, rgb) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, rgb);
    },
    /** Template rows at (x, y): each letter is a key of colors, '.' leaves the pixel. */
    stamp(x, y, lines, colors) {
      lines.forEach((line, dy) =>
        [...line].forEach((ch, dx) => {
          if (ch === '.') return;
          const rgb = colors[ch];
          if (!rgb) throw new Error(`unknown stamp pixel '${ch}'`);
          set(x + dx, y + dy, rgb);
        }),
      );
    },
  };
}

/**
 * A frame around the box (x0, y0)-(x1, y1), the outer edge included. Light from
 * the upper left: the top and left rails take the light, the others the shade.
 * `rails` lists colors from the outer edge in: [lit, shade] per ring.
 */
export function frame(c, x0, y0, x1, y1, rails) {
  rails.forEach(([lit, shade], i) => {
    for (let x = x0 + i; x <= x1 - i; x++) {
      c.set(x, y0 + i, lit);
      c.set(x, y1 - i, shade);
    }
    for (let y = y0 + i; y <= y1 - i; y++) {
      c.set(x0 + i, y, lit);
      c.set(x1 - i, y, shade);
    }
  });
}

const GOLD = {
  outline: [70, 44, 14],
  lit: [236, 196, 92],
  mid: [196, 148, 52],
  shade: [138, 94, 30],
  glint: [255, 240, 170],
  inner: [96, 62, 20],
};

/**
 * A gilded baroque frame: a dark outline, a gold rail lit from the upper left
 * with a bead ornament, a dark inner lip and a glint boss at each corner.
 */
export function gildedFrame(c, x0, y0, x1, y1) {
  frame(c, x0, y0, x1, y1, [
    [GOLD.outline, GOLD.outline],
    [GOLD.lit, GOLD.shade],
    [GOLD.inner, GOLD.inner],
  ]);
  // Bead ornament: every other pixel of the rail is a brighter or deeper bead.
  for (let x = x0 + 2; x <= x1 - 2; x += 2) {
    c.set(x, y0 + 1, GOLD.glint);
    c.set(x, y1 - 1, GOLD.mid);
  }
  for (let y = y0 + 2; y <= y1 - 2; y += 2) {
    c.set(x0 + 1, y, GOLD.glint);
    c.set(x1 - 1, y, GOLD.mid);
  }
  // Corner bosses.
  for (const [x, y] of [
    [x0 + 1, y0 + 1],
    [x1 - 1, y0 + 1],
    [x0 + 1, y1 - 1],
    [x1 - 1, y1 - 1],
  ])
    c.set(x, y, GOLD.glint);
}
