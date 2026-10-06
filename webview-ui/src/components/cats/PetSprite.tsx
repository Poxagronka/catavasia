import { useEffect, useRef, useState } from 'react';

import type { Appearance } from '../../cats/catsApi.js';
import { CAT_PREVIEW_FRAME_MS } from '../../constants.js';
import { getCachedSprite } from '../../office/sprites/index.js';
import { getCarePoses } from '../../office/sprites/petCareFrames.js';
import { getPetSpritesFor, type PetSpriteFrames } from '../../office/sprites/petSpriteData.js';
import type { SpriteData } from '../../office/types.js';

/** Visible box (px): pet cats fill the lower part of their 32-row frames. */
const BOX_W = 32;
const BOX_H = 22;
const WALK = [0, 1, 2, 1];

/** walk: front walk cycle. tour: walk down, right, up, sit, eat. */
function frameAt(s: PetSpriteFrames, mode: 'walk' | 'tour', tick: number): SpriteData {
  if (mode === 'walk') return s.walkDown[WALK[tick % 4]];
  const beat = Math.floor(tick / 8) % 5;
  const f = WALK[tick % 4];
  if (beat === 0) return s.walkDown[f];
  if (beat === 1) return s.walkRight[f];
  if (beat === 2) return s.walkUp[f];
  if (beat === 3) return s.idleDown[Math.floor(tick / 3) % 3];
  const eat = getCarePoses(s).eatRight;
  return eat[Math.floor(tick / 2) % eat.length];
}

/** A pet cat drawn from its real (possibly repainted) pet sheet. */
export function PetSprite({
  petType,
  appearance,
  zoom,
  mode = 'walk',
}: {
  petType: number;
  appearance?: Appearance;
  zoom: number;
  mode?: 'walk' | 'tour';
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
    const sprite = frameAt(sheet, mode, tick);
    const img = getCachedSprite(sprite, zoom);
    ctx.imageSmoothingEnabled = false;
    const x = Math.floor((BOX_W - sprite[0].length) / 2) * zoom;
    ctx.drawImage(img, x, (BOX_H - sprite.length) * zoom);
  }, [petType, appearance, zoom, mode, tick]);

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
