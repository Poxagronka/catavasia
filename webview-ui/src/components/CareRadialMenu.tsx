import { useEffect, useState } from 'react';

import {
  PET_LITTER_CAPACITY,
  PET_MENU_BUTTON_PX,
  PET_MENU_RADIUS_PX,
  TILE_SIZE,
} from '../constants.js';
import type { OfficeState } from '../office/engine/officeState.js';
import { getCatalogEntry } from '../office/layout/furnitureCatalog.js';
import {
  LITTER_STAGE_LABELS,
  litterFreshness,
  litterStage,
} from '../office/petCare/litterStages.js';
import type { CareMenuAction } from '../office/petCare/petCareTypes.js';
import { overlayProjection } from '../office/projection.js';
import type { PetMenuIcon } from '../office/sprites/petCareSprites.js';
import { MENU_ICONS } from '../office/sprites/petCareSprites.js';
import { barColor, iconUrl } from './pixelIcon.js';

interface CareRadialMenuProps {
  officeState: OfficeState;
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: React.RefObject<{ x: number; y: number }>;
}

type Button = { action: CareMenuAction; icon: PetMenuIcon; label: string };

const BOX_BUTTONS: Button[] = [
  { action: 'clean', icon: 'clean', label: 'Clean' },
  { action: 'change', icon: 'change', label: 'Change litter' },
  { action: 'info', icon: 'info', label: 'Info' },
];
const POOP_BUTTONS: Button[] = [{ action: 'cleanup', icon: 'bag', label: 'Clean up' }];

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-6">
      <span className="w-64">{label}</span>
      <span className="inline-block w-80 h-8 bg-bg-dark border-2 border-border">
        <span
          className="block h-full"
          style={{ width: `${Math.round(value)}%`, background: barColor(value) }}
        />
      </span>
    </div>
  );
}

/**
 * Radial menu over a litter box (Clean, Change litter, Info with the fill
 * stage) or a floor poop (Clean up). Opened by a canvas click on the box or
 * the poop (OfficeCanvas); state lives in PetCareSystem.careMenu.
 */
export function CareRadialMenu({ officeState, containerRef, zoom, panRef }: CareRadialMenuProps) {
  const care = officeState.petCare;
  const [, setTick] = useState(0);
  useEffect(() => {
    let rafId = 0;
    let wasOpen = false;
    const tick = () => {
      // Re-render only while a menu is open (plus one frame to remove it).
      const open = care.careMenu !== null;
      if (open || wasOpen) setTick((n) => n + 1);
      wasOpen = open;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [care]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && care.careMenu) care.closeCareMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [care]);

  const menu = care.careMenu;
  const el = containerRef.current;
  if (!menu || !el) return null;
  const box =
    menu.kind === 'box'
      ? officeState.getLayout().furniture.find((f) => f.uid === menu.uid)
      : undefined;
  const poop =
    menu.kind === 'poop' ? care.world.floorPoops.find((p) => p.id === menu.id) : undefined;
  const at = box ?? poop;
  if (!at) return null;
  const project = overlayProjection(
    officeState.getLayout(),
    el.getBoundingClientRect(),
    zoom,
    panRef.current,
    window.devicePixelRatio || 1,
  );
  const cx = project.toScreenX(at.col * TILE_SIZE + TILE_SIZE / 2);
  const cy = project.toScreenY(at.row * TILE_SIZE + TILE_SIZE / 2);
  const half = PET_MENU_BUTTON_PX / 2;
  const radius = Math.max(PET_MENU_RADIUS_PX, (TILE_SIZE * zoom) / (window.devicePixelRatio || 1));
  const buttons = box ? BOX_BUTTONS : POOP_BUTTONS;
  const piles = box ? care.world.boxCount(box.uid) : 0;
  const uses = box ? care.world.litterUses(box.uid) : 0;
  const name = box ? (getCatalogEntry(box.type)?.label ?? 'Litter box') : 'Poop';

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 45 }}>
      {buttons.map(({ action, icon, label }, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / buttons.length;
        const active = action === 'info' && care.infoOpen;
        return (
          <button
            key={action}
            title={label}
            aria-label={label}
            data-care-action={action}
            onClick={() => care.careAct(action, officeState.petCareEnv())}
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
        {name}
      </div>
      {box && care.infoOpen && (
        <div
          className="absolute pixel-panel pointer-events-auto px-8 py-6 text-xs"
          data-care-info
          style={{ left: cx + radius + half + 10, top: cy - radius }}
        >
          <div className="text-sm">{name}</div>
          <div className="text-text-muted mb-4">{LITTER_STAGE_LABELS[litterStage(piles)]}</div>
          <Bar
            label={`Piles ${piles}/${PET_LITTER_CAPACITY}`}
            value={100 - (100 * piles) / PET_LITTER_CAPACITY}
          />
          <Bar label="Fresh litter" value={litterFreshness(uses)} />
        </div>
      )}
    </div>
  );
}
