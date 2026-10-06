import { type ReactNode, useState } from 'react';

import type { CatProfile } from '../../cats/catsApi.js';
import { ENGINE_LABELS } from '../../cats/catsApi.js';
import { catsApi } from '../../cats/localCatsAdapter.js';
import type { LaidOutNode } from '../../cats/orgLayout.js';
import { Button } from '../ui/Button.js';
import { CatSprite } from './CatSprite.js';
import { FIELD } from './fields.js';

/** Size of one pixel of the avatar frame. */
const PX = 4;

/** Filled cells and ring cells of a pixel circle `cells` wide, as SVG paths. */
function pixelCircle(cells: number): { fill: string; ring: string } {
  const r = cells / 2;
  let fill = '';
  let ring = '';
  for (let y = 0; y < cells; y++)
    for (let x = 0; x < cells; x++) {
      const d = Math.hypot(x + 0.5 - r, y + 0.5 - r);
      if (d > r) continue;
      const cell = `M${x * PX} ${y * PX}h${PX}v${PX}h-${PX}z`;
      if (d > r - 1.2) ring += cell;
      else fill += cell;
    }
  return { fill, ring };
}

const CIRCLES = new Map<number, ReturnType<typeof pixelCircle>>();

function PixelAvatar({ cat, cells, ring }: { cat: CatProfile; cells: number; ring: string }) {
  let circle = CIRCLES.get(cells);
  if (!circle) CIRCLES.set(cells, (circle = pixelCircle(cells)));
  const size = cells * PX;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0" shapeRendering="crispEdges">
        <path d={circle.fill} fill="var(--color-bg-dark)" />
      </svg>
      <div
        className="absolute inset-0 flex justify-center"
        style={{ clipPath: `circle(${size / 2 - PX}px)` }}
      >
        <CatSprite appearance={cat.appearance} zoom={2} mode="walk" className="mt-6" />
      </div>
      <svg width={size} height={size} className="absolute inset-0" shapeRendering="crispEdges">
        <path d={circle.ring} fill={ring} />
      </svg>
    </div>
  );
}

function Badge({ children, title }: { children: string; title: string }) {
  return (
    <span
      title={title}
      className="text-2xs leading-none px-4 py-2 border-2 border-border bg-bg-dark text-text-muted"
    >
      {children}
    </span>
  );
}

/** Tiny square button that sits on a node edge. */
function NodeButton({
  label,
  title,
  onClick,
  className,
  danger,
}: {
  label: string;
  title: string;
  onClick: () => void;
  className: string;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      aria-label={title}
      draggable={false}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      className={`absolute w-22 h-22 flex items-center justify-center text-sm leading-none border-2 border-border bg-btn-bg cursor-pointer hover:bg-btn-hover ${
        danger ? 'hover:border-danger hover:text-danger' : 'hover:border-accent-bright'
      } ${className}`}
    >
      {label}
    </button>
  );
}

/** Popover under a node. */
function Popover({ children }: { children: ReactNode }) {
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 top-[calc(100%+16px)] w-260 flex flex-col gap-6 p-8 bg-bg border-2 border-accent-bright shadow-pixel cursor-default"
      draggable={false}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onDragStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {children}
    </div>
  );
}

/** Name + role editor of a fresh report. Every valid edit saves at once. */
export function QuickEdit({
  cat,
  onEditInCats,
  onDone,
}: {
  cat: CatProfile;
  onEditInCats: () => void;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState({ name: cat.name, role: cat.role });
  const [error, setError] = useState<string | null>(null);
  const update = (next: typeof draft) => {
    setDraft(next);
    try {
      const live = catsApi.getSnapshot().cats.find((c) => c.id === cat.id) ?? cat;
      catsApi.saveCat({ ...live, ...next });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  return (
    <Popover>
      <input
        autoFocus
        className={`${FIELD} text-sm py-2`}
        value={draft.name}
        placeholder="Name"
        aria-label="Name"
        spellCheck={false}
        onChange={(e) => update({ ...draft, name: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && onDone()}
      />
      <input
        className={`${FIELD} text-sm py-2`}
        value={draft.role}
        placeholder="Role"
        aria-label="Role"
        spellCheck={false}
        onChange={(e) => update({ ...draft, role: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && onDone()}
      />
      {error && <div className="text-2xs text-status-error">{error}</div>}
      <div className="flex items-center justify-between gap-8">
        <button
          className="text-2xs text-accent-bright underline cursor-pointer bg-transparent border-0 p-0"
          onClick={onEditInCats}
        >
          Edit in Cats
        </button>
        <Button size="sm" variant="accent" onClick={onDone}>
          Done
        </Button>
      </div>
    </Popover>
  );
}

export function DeleteConfirm({
  cat,
  heir,
  onCancel,
}: {
  cat: CatProfile;
  /** Who takes over the reports (or the boss chair). */
  heir: CatProfile | undefined;
  onCancel: () => void;
}) {
  const isBoss = cat.parentId === null;
  return (
    <Popover>
      <div className="text-sm">Delete {cat.name}?</div>
      {heir && (
        <div className="text-2xs text-text-muted">
          {isBoss ? `${heir.name} becomes the boss.` : `Reports move up to ${heir.name}.`}
        </div>
      )}
      <div className="flex gap-6 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Keep
        </Button>
        <Button
          size="sm"
          className="bg-danger! border-danger"
          onClick={() => catsApi.deleteCat(cat.id)}
        >
          Delete
        </Button>
      </div>
    </Popover>
  );
}

export function NodeMenu({
  cat,
  onEditInCats,
  onClose,
}: {
  cat: CatProfile;
  onEditInCats: () => void;
  onClose: () => void;
}) {
  return (
    <Popover>
      {cat.parentId !== null && (
        <Button
          size="sm"
          title="Make this cat the boss; the old boss reports to it"
          onClick={() => {
            catsApi.promoteToBoss(cat.id);
            onClose();
          }}
        >
          ★ Promote to boss
        </Button>
      )}
      <Button size="sm" onClick={onEditInCats}>
        Edit in Cats
      </Button>
    </Popover>
  );
}

export type DropLook = 'none' | 'ok' | 'over' | 'dimmed' | 'dragged';

export interface OrgNodeProps {
  cat: CatProfile;
  box: LaidOutNode;
  selected: boolean;
  drop: DropLook;
  /** Popover content under the node (quick edit, delete confirm, menu). */
  popover: ReactNode;
  onSelect: () => void;
  onOpen: () => void;
  onAdd: () => void;
  onDelete: () => void;
  onMenu: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (over: boolean) => void;
  onDrop: () => void;
}

/** One cat on the chart: pixel avatar + name card, with +, x and menu buttons. */
export function OrgNode(p: OrgNodeProps) {
  const { cat, box } = p;
  const isBoss = cat.parentId === null;
  const frame =
    p.drop === 'over'
      ? 'border-accent-bright bg-active-bg'
      : p.selected
        ? 'border-accent-bright bg-btn-bg'
        : isBoss
          ? 'border-accent bg-btn-bg'
          : 'border-border bg-btn-bg';
  const ring =
    p.drop === 'over' || p.selected
      ? 'var(--color-accent-bright)'
      : isBoss
        ? 'var(--color-status-permission)'
        : 'var(--color-border)';
  const badges = (
    <span className="flex gap-4 shrink-0">
      {!box.compact && <Badge title="Engine">{ENGINE_LABELS[cat.engine]}</Badge>}
      <Badge title={`Model (${ENGINE_LABELS[cat.engine]})`}>{cat.model}</Badge>
      <Badge title="Effort">{cat.effort}</Badge>
    </span>
  );
  // Keep the text clear of the corner buttons.
  const textMax = box.compact ? 'max-w-full' : 'max-w-[calc(100%-56px)]';
  const text = (
    <>
      <span className={`text-sm leading-tight truncate shrink-0 ${textMax}`}>
        {isBoss && <span className="text-status-permission">★ </span>}
        {cat.name}
      </span>
      <span className={`text-2xs leading-tight text-text-muted truncate shrink-0 ${textMax}`}>
        {isBoss ? 'Boss' : cat.role || 'Cat'}
      </span>
    </>
  );

  return (
    <div
      draggable
      data-cat-id={cat.id}
      className={`absolute select-none cursor-grab ${p.popover ? 'z-20' : 'z-10'} ${
        p.drop === 'dimmed' ? 'opacity-35' : p.drop === 'dragged' ? 'opacity-60' : ''
      }`}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      onClick={(e) => {
        e.stopPropagation();
        p.onSelect();
      }}
      onDoubleClick={p.onOpen}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', cat.id);
        e.dataTransfer.effectAllowed = 'move';
        p.onDragStart();
      }}
      onDragEnd={p.onDragEnd}
      onDragOver={(e) => {
        if (p.drop !== 'ok' && p.drop !== 'over') return;
        e.preventDefault();
        if (p.drop !== 'over') p.onDragOver(true);
      }}
      onDragLeave={() => p.drop === 'over' && p.onDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        p.onDrop();
      }}
    >
      {box.compact ? (
        <div className="flex items-center h-full">
          <div className="relative z-1">
            <PixelAvatar cat={cat} cells={14} ring={ring} />
          </div>
          <div
            className={`flex flex-col items-start justify-center gap-2 -ml-16 pl-22 pr-26 h-full flex-1 min-w-0 border-2 ${frame}`}
          >
            {text}
            {badges}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center h-full">
          <div className="relative z-1">
            <PixelAvatar cat={cat} cells={19} ring={ring} />
          </div>
          <div
            className={`flex flex-col items-center gap-2 -mt-18 pt-20 pb-16 px-8 w-full flex-1 min-h-0 border-2 ${frame}`}
          >
            {text}
            {badges}
          </div>
        </div>
      )}
      <NodeButton
        label="×"
        title={`Delete ${cat.name}`}
        danger
        onClick={p.onDelete}
        className={box.compact ? 'top-2 right-2' : 'top-62 right-2'}
      />
      <NodeButton
        label="⋯"
        title="More"
        onClick={p.onMenu}
        className={box.compact ? 'bottom-2 right-2' : 'top-62 left-2'}
      />
      <NodeButton
        label="+"
        title={`Add a report to ${cat.name}`}
        onClick={p.onAdd}
        className={`-bottom-12 -translate-x-1/2 text-accent-bright ${
          box.compact ? 'left-28' : 'left-1/2'
        }`}
      />
      {p.popover}
    </div>
  );
}
