// Label grid for one 16x32 character frame.
// Parts are stamped as semantic labels (fur, belly, eye...). A breed turns
// the labels into colors later, so one pose set serves every breed.

export const FRAME_W = 16;
export const FRAME_H = 32;

/** Template characters → semantic labels. '.' = empty. */
const LABELS = {
  F: 'fur',
  f: 'shade',
  h: 'light',
  W: 'belly',
  P: 'paw',
  i: 'earIn',
  e: 'eye',
  E: 'pupil',
  n: 'nose',
  m: 'line',
  o: 'line',
  C: 'collar',
  G: 'tag',
  Q: 'paper',
  q: 'ink',
  w: 'whisker',
  U: 'mug',
  K: 'mugShade',
  D: 'coffee',
};

export class Frame {
  constructor() {
    this.cells = Array.from({ length: FRAME_H }, () => new Array(FRAME_W).fill(null));
    this.overlay = [];
  }

  set(x, y, cell) {
    if (x < 0 || y < 0 || x >= FRAME_W || y >= FRAME_H) return;
    const cur = this.cells[y][x];
    if (cur && cur.z > cell.z) return;
    this.cells[y][x] = cell;
  }

  /** Stamp an ASCII template. Local coords (lx, ly) start at the template origin + shift. */
  stamp(rows, ox, oy, part, z, opts = {}) {
    const { rim = false, lyShift = 0, flip = false, dir } = opts;
    rows.forEach((row, ly) => {
      [...row].forEach((ch, lx) => {
        if (ch === '.' || ch === ' ') return;
        const label = LABELS[ch];
        if (!label) throw new Error(`Unknown template char '${ch}'`);
        const x = flip ? ox + row.length - 1 - lx : ox + lx;
        this.set(x, oy + ly, { label, part, lx, ly: ly + lyShift, z, rim, dir });
      });
    });
  }

  /** Filled rectangle of one label. */
  rect(x0, y0, w, h, part, z, label = 'fur', opts = {}) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        this.set(x0 + x, y0 + y, { label, part, lx: x, ly: y, z, rim: !!opts.rim });
  }

  /**
   * Thick polyline. Each step gets index `ly` along the path so patterns
   * (rings, dark tips) follow the limb. The last `tip` steps use `tipLabel`.
   */
  stroke(points, thick, part, z, opts = {}) {
    const { rim = false, tip = 0, tipLabel = 'paw', dir } = opts;
    const steps = [];
    for (let i = 0; i < points.length - 1; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[i + 1];
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let s = 0; s < n || (i === points.length - 2 && s === n); s++) {
        steps.push([
          Math.round(x0 + ((x1 - x0) * s) / (n || 1)),
          Math.round(y0 + ((y1 - y0) * s) / (n || 1)),
        ]);
      }
    }
    steps.forEach(([x, y], idx) => {
      const label = idx >= steps.length - tip ? tipLabel : 'fur';
      for (let dy = 0; dy < thick; dy++)
        for (let dx = 0; dx < thick; dx++)
          this.set(x + dx, y + dy, {
            label,
            part,
            lx: dx,
            ly: idx,
            len: steps.length,
            z,
            rim,
            dir,
          });
    });
  }

  /**
   * Stamp a toy template (toyArt.mjs characters, own outline): cells keep the
   * toy palette and add no outline halo. rowFilter picks which rows to draw.
   */
  stampProp(rows, ox, oy, z, rowFilter = () => true) {
    rows.forEach((row, ly) => {
      if (!rowFilter(ly)) return;
      [...row].forEach((ch, lx) => {
        if (ch === '.') return;
        this.set(ox + lx, oy + ly, { label: `toy:${ch}`, part: 'prop', lx, ly, z, noHalo: true });
      });
    });
  }

  /** Pixels drawn after the outline pass (whiskers). Only lands on empty or outline cells. */
  addOverlay(x, y, label) {
    this.overlay.push([x, y, label]);
  }

  /**
   * Resolve outlines: empty cells next to a filled cell become outline, and a
   * cell next to a higher "rim" part (head over body, arm over torso) becomes
   * an inner outline so overlapping parts stay readable.
   */
  finish() {
    const out = this.cells.map((row) => row.slice());
    const at = (x, y) => (x < 0 || y < 0 || x >= FRAME_W || y >= FRAME_H ? null : this.cells[y][x]);
    const nbrs = (x, y) => [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)];
    for (let y = 0; y < FRAME_H; y++) {
      for (let x = 0; x < FRAME_W; x++) {
        const c = this.cells[y][x];
        if (!c) {
          // Props with their own outline (noHalo) get no extra line around them.
          if (nbrs(x, y).some((n) => n && !n.noHalo))
            out[y][x] = { label: 'outline', part: 'edge', lx: 0, ly: 0 };
          continue;
        }
        if (nbrs(x, y).some((n) => n && n.rim && n.part !== c.part && n.z > c.z)) {
          out[y][x] = { ...c, label: 'outline' };
        }
      }
    }
    for (const [x, y, label] of this.overlay) {
      if (x < 0 || y < 0 || x >= FRAME_W || y >= FRAME_H) continue;
      const c = out[y][x];
      if (!c || c.label === 'outline') out[y][x] = { label, part: 'overlay', lx: 0, ly: 0 };
    }
    return out;
  }
}
