import { useEffect, useRef } from 'react';

import { TASK_AVATAR_ZOOM } from '../../constants.js';
import { getCachedSprite, getCharacterSprites } from '../../office/sprites/index.js';
import { Direction } from '../../office/types.js';
import { catName } from './taskFormat.js';

/** The task's cat, front-facing, drawn from the same sprites as the office. */
export function CatAvatar({ palette, hueShift }: { palette?: number; hueShift?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || palette === undefined) return;
    const sprite = getCharacterSprites(palette, hueShift ?? 0).walk[Direction.DOWN][0];
    const img = getCachedSprite(sprite, TASK_AVATAR_ZOOM);
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, img.width, img.height);
    ctx.drawImage(img, 0, 0);
  }, [palette, hueShift]);

  return (
    <canvas
      ref={ref}
      className="shrink-0 w-32 h-64"
      style={{ imageRendering: 'pixelated' }}
      title={catName(palette)}
    />
  );
}
