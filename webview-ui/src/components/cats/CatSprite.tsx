import { useEffect, useMemo, useRef, useState } from 'react';

import { type ArtDir, renderAppearance } from '../../cats/catArt.js';
import type { Appearance } from '../../cats/catsApi.js';
import { CAT_PREVIEW_FRAME_MS } from '../../constants.js';
import { getCachedSprite } from '../../office/sprites/index.js';

const WALK = [0, 1, 2, 1];

interface CatSpriteProps {
  appearance: Appearance;
  zoom: number;
  /** still: idle frame. walk: walk cycle. */
  mode?: 'still' | 'walk';
  /** Facing; the walk plays in place. */
  dir?: ArtDir;
  className?: string;
}

/** A profile's cat, generated in the webview from its Appearance. */
export function CatSprite({
  appearance,
  zoom,
  mode = 'still',
  dir = 'down',
  className = '',
}: CatSpriteProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);
  const frames = useMemo(() => renderAppearance(appearance), [appearance]);

  useEffect(() => {
    if (mode === 'still') return;
    const id = setInterval(() => setTick((t) => t + 1), CAT_PREVIEW_FRAME_MS);
    return () => clearInterval(id);
  }, [mode]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const frame = mode === 'walk' ? WALK[tick % WALK.length] : 1;
    const img = getCachedSprite(frames[dir][frame], zoom);
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, img.width, img.height);
    ctx.drawImage(img, 0, 0);
  }, [frames, zoom, mode, dir, tick]);

  return (
    <canvas
      ref={ref}
      className={`shrink-0 ${className}`}
      style={{ imageRendering: 'pixelated', width: 16 * zoom, height: 32 * zoom }}
    />
  );
}
