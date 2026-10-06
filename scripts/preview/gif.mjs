// Minimal animated GIF writer for pixel-art previews (no dependency): one
// global palette of at most 256 colors, LZW-coded frames, looping forever.
// Frames: { w, h, data: Uint8Array RGBA }, all the same size.

/**
 * Encode frames (opaque RGBA) at `scale`× into GIF bytes; `delayMs` per frame.
 * Blended effects (steam) may need more than 256 colors: then the low bits
 * of each channel go, a step at a time, until the palette fits.
 */
export function encodeGif(frames, delayMs, scale = 1) {
  for (const mask of [0xff, 0xfe, 0xfc, 0xf8, 0xf0]) {
    const out = encodeWith(frames, delayMs, scale, mask);
    if (out) return out;
  }
  throw new Error('more than 256 colors in a preview, even at 4 bits a channel');
}

function encodeWith(frames, delayMs, scale, mask) {
  const w = frames[0].w * scale;
  const h = frames[0].h * scale;
  const colors = new Map();
  const indexed = [];
  for (const f of frames) {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = ((Math.floor(y / scale) * f.w + Math.floor(x / scale)) * 4) | 0;
        const key =
          ((f.data[i] & mask) << 16) | ((f.data[i + 1] & mask) << 8) | (f.data[i + 2] & mask);
        let c = colors.get(key);
        if (c === undefined) {
          if (colors.size >= 256) return null;
          c = colors.size;
          colors.set(key, c);
        }
        out[y * w + x] = c;
      }
    indexed.push(out);
  }
  const bits = Math.max(2, Math.ceil(Math.log2(Math.max(2, colors.size))));
  const bytes = [];
  const u16 = (n) => bytes.push(n & 255, (n >> 8) & 255);
  bytes.push(...Buffer.from('GIF89a'));
  u16(w);
  u16(h);
  bytes.push(0xf0 | (bits - 1), 0, 0);
  const table = new Array((1 << bits) * 3).fill(0);
  for (const [key, c] of colors) table.splice(c * 3, 3, key >> 16, (key >> 8) & 255, key & 255);
  bytes.push(...table);
  // Netscape loop extension: loop forever.
  bytes.push(0x21, 0xff, 11, ...Buffer.from('NETSCAPE2.0'), 3, 1, 0, 0, 0);
  for (const px of indexed) {
    bytes.push(0x21, 0xf9, 4, 0);
    u16(Math.round(delayMs / 10));
    bytes.push(0, 0);
    bytes.push(0x2c);
    u16(0);
    u16(0);
    u16(w);
    u16(h);
    bytes.push(0);
    bytes.push(bits);
    const data = lzw(px, bits);
    for (let i = 0; i < data.length; i += 255) {
      const chunk = data.slice(i, i + 255);
      bytes.push(chunk.length, ...chunk);
    }
    bytes.push(0);
  }
  bytes.push(0x3b);
  return Buffer.from(bytes);
}

/** GIF LZW: variable code size from bits+1 up to 12, clear code on a full table. */
function lzw(pixels, minBits) {
  const clear = 1 << minBits;
  const end = clear + 1;
  const out = [];
  let acc = 0;
  let accBits = 0;
  let size = minBits + 1;
  const emit = (code) => {
    acc |= code << accBits;
    accBits += size;
    while (accBits >= 8) {
      out.push(acc & 255);
      acc >>= 8;
      accBits -= 8;
    }
  };
  let dict = new Map();
  let next = end + 1;
  emit(clear);
  let prefix = pixels[0];
  for (let i = 1; i < pixels.length; i++) {
    const k = pixels[i];
    const key = prefix * 4096 + k;
    const hit = dict.get(key);
    if (hit !== undefined) {
      prefix = hit;
      continue;
    }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > 1 << size && size < 12) size++;
    } else {
      emit(clear);
      dict = new Map();
      next = end + 1;
      size = minBits + 1;
    }
    prefix = k;
  }
  emit(prefix);
  emit(end);
  if (accBits > 0) out.push(acc & 255);
  return out;
}
