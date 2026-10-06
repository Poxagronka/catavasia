import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { parseCarpetPng } from '../../core/src/assets/pngDecoder.js';

const CARPETS_DIR = path.join(__dirname, '../../webview-ui/public/assets/carpets');

/** Swap the west and east bits of a marching-squares case (NW=1, NE=2, SE=4, SW=8). */
function mirrorCase(msCase: number): number {
  return ((msCase & 1) << 1) | ((msCase & 2) >> 1) | ((msCase & 4) << 1) | ((msCase & 8) >> 1);
}

describe('carpet sprite sheets', () => {
  const files = fs.readdirSync(CARPETS_DIR).filter((f) => /^carpet_\d+\.png$/.test(f));

  it.each(files)('%s: every case is the horizontal mirror of its pair', (file) => {
    const sprites = parseCarpetPng(fs.readFileSync(path.join(CARPETS_DIR, file)));
    for (let msCase = 1; msCase < sprites.length; msCase++) {
      const mirrored = sprites[mirrorCase(msCase)].map((row) => [...row].reverse());
      expect(sprites[msCase], `case ${msCase}`).toEqual(mirrored);
    }
  });
});
