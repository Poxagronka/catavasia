import { useEffect, useRef, useState } from 'react';

import type { ArtDir } from '../../cats/catArt.js';
import type { Appearance } from '../../cats/catsApi.js';
import { CAT_PREVIEW_FRAME_MS } from '../../constants.js';
import { getCachedSprite } from '../../office/sprites/index.js';
import { getPetSpritesFor } from '../../office/sprites/petSpriteData.js';

/** Visible box (px): pet cats fill the lower part of their 32-row frames. */
const BOX_W = 32;
const BOX_H = 22;
const WALK = [0, 1, 2, 1];

const WALKS = { down: 'walkDown', right: 'walkRight', up: 'walkUp' } as const;

/** A pet cat drawn from its real (possibly repainted) pet sheet. */
export function PetSprite({
  petType,
  appearance,
  zoom,
  dir = 'down',
}: {
  petType: number;
  appearance?: Appearance;
  zoom: number;
  /** Facing; the walk plays in place. */
  dir?: ArtDir;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), CAT_PREVIEW_FRAME_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, BOX_W * zoom, BOX_H * zoom);
    const sheet = getPetSpritesFor({ petType, appearance });
    if (!sheet) return; // sheets not loaded yet: the next tick retries
    const sprite = sheet[WALKS[dir]][WALK[tick % 4]];
    const img = getCachedSprite(sprite, zoom);
    ctx.imageSmoothingEnabled = false;
    const x = Math.floor((BOX_W - sprite[0].length) / 2) * zoom;
    ctx.drawImage(img, x, (BOX_H - sprite.length) * zoom);
  }, [petType, appearance, zoom, dir, tick]);

  return (
    <canvas
      ref={ref}
      width={BOX_W * zoom}
      height={BOX_H * zoom}
      className="shrink-0"
      style={{ imageRendering: 'pixelated', width: BOX_W * zoom, height: BOX_H * zoom }}
    />
  );
}
