import { PET_MENU_ICON_SCALE } from '../constants.js';
import type { SpriteData } from '../office/types.js';

// Shared by the radial care menus (PetRadialMenu, CareRadialMenu).

/** Bar color per need value: the request threshold reads red. */
const NEED_BAR_LOW = 35;
const NEED_BAR_MID = 60;

const iconUrls = new Map<SpriteData, string>();

/** A sprite as a data URL at PET_MENU_ICON_SCALE, cached per sprite. */
export function iconUrl(sprite: SpriteData): string {
  let url = iconUrls.get(sprite);
  if (url) return url;
  const k = PET_MENU_ICON_SCALE;
  const canvas = document.createElement('canvas');
  canvas.width = sprite[0].length * k;
  canvas.height = sprite.length * k;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  sprite.forEach((row, y) =>
    row.forEach((px, x) => {
      if (!px) return;
      ctx.fillStyle = px;
      ctx.fillRect(x * k, y * k, k, k);
    }),
  );
  url = canvas.toDataURL();
  iconUrls.set(sprite, url);
  return url;
}

export function barColor(value: number): string {
  if (value < NEED_BAR_LOW) return 'var(--color-danger)';
  if (value < NEED_BAR_MID) return 'var(--color-warning)';
  return 'var(--color-status-success)';
}
