import { useEffect, useMemo, useRef, useState } from 'react';

import { type ArtDir, renderAppearance } from '../../cats/catArt.js';
import type { Appearance } from '../../cats/catsApi.js';
import { CAT_PREVIEW_FRAME_MS } from '../../constants.js';
import { getCachedSprite } from '../../office/sprites/index.js';

/** Walk cycle, then a typing beat. */
const WALK = [0, 1, 2, 1];
const TYPE = [3, 4, 3, 4];
/** In "tour" mode the cat walks toward each direction in turn. */
const TOUR: ArtDir[] = ['down', 'right', 'up', 'down'];

interface CatSpriteProps {
  appearance: Appearance;
  zoom: number;
  /** still: idle front frame. walk: front walk cycle. tour: walk + type through all directions. */
  mode?: 'still' | 'walk' | 'tour';
  className?: string;
}

/** A profile's cat, generated in the webview from its Appearance. */
export function CatSprite({ appearance, zoom, mode = 'still', className = '' }: CatSpriteProps) {
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
    let dir: ArtDir = 'down';
    let frame = 1;
    if (mode === 'walk') frame = WALK[tick % WALK.length];
    if (mode === 'tour') {
      const beat = Math.floor(tick / 8);
      dir = TOUR[beat % TOUR.length];
      const typing = dir === 'down' && beat % TOUR.length === TOUR.length - 1;
      frame = (typing ? TYPE : WALK)[tick % 4];
    }
    const img = getCachedSprite(frames[dir][frame], zoom);
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, img.width, img.height);
    ctx.drawImage(img, 0, 0);
  }, [frames, zoom, mode, tick]);

  return (
    <canvas
      ref={ref}
      className={`shrink-0 ${className}`}
      style={{ imageRendering: 'pixelated', width: 16 * zoom, height: 32 * zoom }}
    />
  );
}
