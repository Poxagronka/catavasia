import { type ReactNode, useState } from 'react';

import {
  type ArtDir,
  BREED_PRESETS,
  breedPattern,
  COAT_PRESETS,
  layerColor,
  type Preset,
  resolveBreed,
  toHex,
} from '../../cats/catArt.js';
import {
  type Appearance,
  type ColorLayers,
  PATTERN_IDS,
  type PatternId,
} from '../../cats/catsApi.js';
import { CAT_EDITOR_ZOOM, CAT_LIST_ZOOM } from '../../constants.js';
import { Checkbox } from '../ui/Checkbox.js';
import { CatSprite } from './CatSprite.js';
import { FIELD } from './fields.js';

/** Marking layers each pattern paints, besides fur and belly. */
const MARKINGS: Record<PatternId, Array<keyof ColorLayers>> = {
  solid: [],
  tabby: ['stripe'],
  tuxedo: [],
  calico: ['patchA', 'patchB'],
  tortie: ['patchA', 'patchB'],
  siamese: ['point'],
  bengal: ['stripe'],
  sweater: [],
};

const LAYER_LABEL: Record<keyof ColorLayers, string> = {
  fur: 'Fur',
  belly: 'Belly',
  stripe: 'Stripes',
  patchA: 'Patch 1',
  patchB: 'Patch 2',
  point: 'Points',
};

const DEFAULT_COLLAR: [number, number, number] = [204, 48, 60];

/** Preview facings in turn order. Left is the right sheet, mirrored. */
const FACINGS = [
  { name: 'Front', dir: 'down', flip: false },
  { name: 'Right', dir: 'right', flip: false },
  { name: 'Back', dir: 'up', flip: false },
  { name: 'Left', dir: 'right', flip: true },
] as const;

/**
 * Preset grid: fixed square tiles, at most 9 columns. Breeds and coats share
 * the width, so their columns line up and wrap together on narrow windows.
 */
const GRID = 'grid grid-cols-[repeat(auto-fill,72px)] gap-4 max-w-[680px]';

const ARROW = 'w-24 h-24 p-0 border-2 border-border bg-bg-dark hover:bg-btn-hover cursor-pointer';

const same = (a: Appearance, b: Appearance) => JSON.stringify(a) === JSON.stringify(b);

/** Draws a look: `undefined` = the pet's own sheet ("Original"). Defaults to agent cats. */
export type PreviewFn = (
  a: Appearance | undefined,
  size: 'tile' | 'big',
  dir?: ArtDir,
) => ReactNode;

const agentPreview: PreviewFn = (a, size, dir) => (
  <CatSprite
    appearance={a ?? {}}
    zoom={size === 'big' ? CAT_EDITOR_ZOOM : CAT_LIST_ZOOM}
    mode={size === 'big' ? 'walk' : 'still'}
    dir={dir}
  />
);

function TileButton({
  title,
  selected,
  onClick,
  children,
}: {
  title: string;
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      title={title}
      aria-label={title}
      aria-pressed={selected}
      onClick={onClick}
      className={`w-72 h-72 p-0 flex items-center justify-center overflow-hidden border-2 rounded-none cursor-pointer hover:bg-btn-hover ${
        selected ? 'border-accent bg-active-bg' : 'border-border bg-bg-dark'
      }`}
    >
      {children}
    </button>
  );
}

function PresetGrid({
  title,
  presets,
  value,
  onPick,
  preview,
  lead,
}: {
  title: string;
  presets: Preset[];
  value: Appearance | undefined;
  onPick: (a: Appearance) => void;
  preview: PreviewFn;
  /** Extra tile before the presets (the pets' "Original"). */
  lead?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <span className="text-xs text-text-muted">{title}</span>
      <div className={GRID}>
        {lead}
        {presets.map((p) => (
          <TileButton
            key={p.id}
            title={`${p.name} (${p.label})`}
            selected={!!value && same(p.appearance, value)}
            onClick={() => onPick(p.appearance)}
          >
            {preview(p.appearance, 'tile')}
          </TileButton>
        ))}
      </div>
    </div>
  );
}

/** One form row: the label column, then the control column. */
function FormRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[64px_1fr] items-center gap-8 h-32 text-xs">
      <span className="text-text-muted">{label}</span>
      <div className="flex items-center gap-8 min-w-0">{children}</div>
    </div>
  );
}

function Swatch({
  label,
  color,
  overridden,
  onChange,
  onReset,
}: {
  label: string;
  color: string;
  overridden: boolean;
  onChange: (hex: string) => void;
  onReset: () => void;
}) {
  return (
    <>
      <input
        type="color"
        aria-label={label}
        value={color}
        onChange={(e) => onChange(e.target.value)}
        className="w-48 h-24 p-0 border-2 border-border bg-bg-dark rounded-none cursor-pointer"
      />
      {/* Hidden, not removed, so the rows keep one width. */}
      <button
        className={`text-2xs text-text-muted hover:text-text cursor-pointer ${overridden ? '' : 'invisible'}`}
        title="Back to the breed colour"
        onClick={onReset}
      >
        reset
      </button>
    </>
  );
}

/**
 * Breed preset or custom coat, with a live preview that the arrows turn.
 * Shared by agents and pets. Pets pass their own `preview` and `original`:
 * `value` undefined means the pet keeps its own sheet, and the colour fields hide.
 */
export function AppearanceEditor({
  value: own,
  onChange,
  preview = agentPreview,
  onOriginal,
}: {
  value: Appearance | undefined;
  onChange: (a: Appearance) => void;
  preview?: PreviewFn;
  onOriginal?: () => void;
}) {
  const [facing, setFacing] = useState(0);
  const turn = (step: number) => setFacing((f) => (f + step + FACINGS.length) % FACINGS.length);
  const { name: facingName, dir, flip } = FACINGS[facing];
  const value = own ?? {};
  const pattern = value.pattern ?? breedPattern(value.breed);
  const layers: Array<keyof ColorLayers> = ['fur', 'belly', ...MARKINGS[pattern]];
  const setLayer = (layer: keyof ColorLayers, hex: string | undefined) => {
    const colors = { ...value.colors, [layer]: hex };
    if (hex === undefined) delete colors[layer];
    onChange({ ...value, colors });
  };
  // Leo, Dobby and Bear wear no collar by default.
  const collarOff =
    value.collar === 'none' || (value.collar === undefined && resolveBreed(value).collar === null);

  return (
    <div className="flex flex-wrap gap-12 items-start">
      <div className="flex flex-col gap-4 shrink-0">
        <div className="min-w-[176px] aspect-square p-8 flex items-center justify-center bg-bg-dark border-2 border-border">
          <div style={flip ? { transform: 'scaleX(-1)' } : undefined}>
            {preview(own, 'big', dir)}
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-text-muted">
          <button className={ARROW} title="Turn left" onClick={() => turn(-1)}>
            ◀
          </button>
          {facingName}
          <button className={ARROW} title="Turn right" onClick={() => turn(1)}>
            ▶
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-10 min-w-[240px] flex-1">
        <PresetGrid
          title="Breeds"
          presets={BREED_PRESETS}
          value={own}
          onPick={onChange}
          preview={preview}
          lead={
            onOriginal && (
              <TileButton title="Original sprite" selected={!own} onClick={onOriginal}>
                {preview(undefined, 'tile')}
              </TileButton>
            )
          }
        />
        <PresetGrid
          title="Coats"
          presets={COAT_PRESETS}
          value={own}
          onPick={onChange}
          preview={preview}
        />
        {!own ? (
          <div className="text-xs text-text-muted">
            Original sprite. Pick a breed or a coat to recolour it.
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-x-16 gap-y-4 max-w-[680px]">
            <FormRow label="Pattern">
              <select
                className={`${FIELD} text-xs py-2 w-120!`}
                value={pattern}
                onChange={(e) => onChange({ ...value, pattern: e.target.value as PatternId })}
              >
                {PATTERN_IDS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </FormRow>
            {layers.map((layer) => (
              <FormRow key={layer} label={LAYER_LABEL[layer]}>
                <Swatch
                  label={LAYER_LABEL[layer]}
                  color={value.colors?.[layer] ?? layerColor(value, layer)}
                  overridden={value.colors?.[layer] !== undefined}
                  onChange={(hex) => setLayer(layer, hex)}
                  onReset={() => setLayer(layer, undefined)}
                />
              </FormRow>
            ))}
            <FormRow label="Eyes">
              <Swatch
                label="Eyes"
                color={value.eyes ?? layerColor(value, 'eyes')}
                overridden={value.eyes !== undefined}
                onChange={(eyes) => onChange({ ...value, eyes })}
                onReset={() => onChange({ ...value, eyes: undefined })}
              />
            </FormRow>
            <FormRow label="Collar">
              <div className={`flex items-center gap-8 ${collarOff ? 'invisible' : ''}`}>
                <Swatch
                  label="Collar"
                  color={
                    value.collar && value.collar !== 'none'
                      ? value.collar
                      : layerColor(value, 'collar')
                  }
                  overridden={value.collar !== undefined && !collarOff}
                  onChange={(collar) => onChange({ ...value, collar })}
                  onReset={() => onChange({ ...value, collar: undefined })}
                />
              </div>
              <Checkbox
                label="No collar"
                checked={collarOff}
                className="w-auto! gap-6 py-2! px-4! text-xs flex-row-reverse"
                onChange={() => {
                  if (!collarOff) return onChange({ ...value, collar: 'none' });
                  // Back to the breed collar, or a red one when the breed has none.
                  const own = resolveBreed({ ...value, collar: undefined }).collar;
                  onChange({ ...value, collar: own ? undefined : toHex(DEFAULT_COLLAR) });
                }}
              />
            </FormRow>
          </div>
        )}
      </div>
    </div>
  );
}
