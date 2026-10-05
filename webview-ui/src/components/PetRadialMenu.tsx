import { useEffect, useState } from 'react';

import {
  PET_MENU_BUTTON_PX,
  PET_MENU_ICON_SCALE,
  PET_MENU_RADIUS_PX,
  TILE_SIZE,
} from '../constants.js';
import type { OfficeState } from '../office/engine/officeState.js';
import type { PetMenuAction } from '../office/petCare/petCareTypes.js';
import type { NeedKey } from '../office/petCare/petNeeds.js';
import { moodLabel, moodScore, NEED_KEYS, NEED_LABELS } from '../office/petCare/petNeeds.js';
import { overlayProjection } from '../office/projection.js';
import type { PetMenuIcon } from '../office/sprites/petCareSprites.js';
import { MENU_ICONS } from '../office/sprites/petCareSprites.js';
import type { SpriteData } from '../office/types.js';

interface PetRadialMenuProps {
  officeState: OfficeState;
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: React.RefObject<{ x: number; y: number }>;
}

const ACTIONS: Array<{ action: PetMenuAction; icon: PetMenuIcon; label: string }> = [
  { action: 'feed', icon: 'food', label: 'Feed' },
  { action: 'water', icon: 'water', label: 'Water' },
  { action: 'scratch', icon: 'scratch', label: 'Scratch' },
  { action: 'play', icon: 'play', label: 'Play' },
  { action: 'clean', icon: 'clean', label: 'Clean' },
  { action: 'info', icon: 'info', label: 'Info' },
];

/** Bar color per need value: the request threshold reads red. */
const NEED_BAR_LOW = 35;
const NEED_BAR_MID = 60;

const iconUrls = new Map<SpriteData, string>();

/** A sprite as a data URL at PET_MENU_ICON_SCALE, cached per sprite. */
function iconUrl(sprite: SpriteData): string {
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

function barColor(value: number): string {
  if (value < NEED_BAR_LOW) return 'var(--color-danger)';
  if (value < NEED_BAR_MID) return 'var(--color-warning)';
  return 'var(--color-status-success)';
}

/**
 * Radial care menu over a cat pet: six pixel buttons on a ring (Feed, Water,
 * Scratch, Play, Clean, Info) and an Info panel with the needs bars. Opened
 * by a canvas click on a cat (OfficeCanvas); state lives in PetCareSystem.
 */
export function PetRadialMenu({ officeState, containerRef, zoom, panRef }: PetRadialMenuProps) {
  const care = officeState.petCare;
  const [, setTick] = useState(0);
  useEffect(() => {
    let rafId = 0;
    let wasOpen = false;
    const tick = () => {
      // Re-render only while a menu is open (plus one frame to remove it).
      const open = care.menuPetId !== null;
      if (open || wasOpen) setTick((n) => n + 1);
      wasOpen = open;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [care]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && care.menuPetId) care.closeMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [care]);

  const pet = officeState.pets.find((p) => p.id === care.menuPetId);
  const el = containerRef.current;
  if (!pet || !el) return null;
  const project = overlayProjection(
    officeState.getLayout(),
    el.getBoundingClientRect(),
    zoom,
    panRef.current,
    window.devicePixelRatio || 1,
  );
  // Ring center: the middle of the cat's body (half a tile above its feet).
  const cx = project.toScreenX(pet.x);
  const cy = project.toScreenY(pet.y - TILE_SIZE / 2);
  const needs = care.world.entry(pet.id).needs;
  const mood = moodLabel(moodScore(needs));
  const half = PET_MENU_BUTTON_PX / 2;
  // The ring clears the cat at any zoom: at least one tile from its center.
  const radius = Math.max(PET_MENU_RADIUS_PX, (TILE_SIZE * zoom) / (window.devicePixelRatio || 1));

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 45 }}>
      {ACTIONS.map(({ action, icon, label }, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / ACTIONS.length;
        const active = action === 'info' && care.infoOpen;
        return (
          <button
            key={action}
            title={label}
            aria-label={label}
            data-pet-action={action}
            onClick={() => care.act(pet, action, officeState.petCareEnv())}
            className={`absolute pointer-events-auto flex items-center justify-center p-0 border-2 rounded-none shadow-pixel cursor-pointer ${
              active ? 'bg-active-bg border-accent' : 'bg-bg border-border hover:bg-btn-hover'
            }`}
            style={{
              left: cx + Math.cos(angle) * radius - half,
              top: cy + Math.sin(angle) * radius - half,
              width: PET_MENU_BUTTON_PX,
              height: PET_MENU_BUTTON_PX,
            }}
          >
            <img
              src={iconUrl(MENU_ICONS[icon])}
              alt=""
              draggable={false}
              style={{ imageRendering: 'pixelated' }}
            />
          </button>
        );
      })}
      <div
        className="absolute pixel-panel px-4 text-xs whitespace-nowrap"
        style={{ left: cx, top: cy + radius + half + 6, transform: 'translateX(-50%)' }}
      >
        {pet.name}
      </div>
      {care.infoOpen && (
        <div
          className="absolute pixel-panel pointer-events-auto px-8 py-6 text-xs"
          data-pet-info
          style={{ left: cx + radius + half + 10, top: cy - radius }}
        >
          <div className="text-sm">{pet.name}</div>
          <div className="text-text-muted mb-4">Mood: {mood}</div>
          {NEED_KEYS.map((k: NeedKey) => (
            <div key={k} className="flex items-center gap-6">
              <span className="w-48">{NEED_LABELS[k]}</span>
              <span className="inline-block w-80 h-8 bg-bg-dark border-2 border-border">
                <span
                  className="block h-full"
                  style={{ width: `${Math.round(needs[k])}%`, background: barColor(needs[k]) }}
                />
              </span>
              <span className="w-28 text-right text-text-muted">{Math.round(needs[k])}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
