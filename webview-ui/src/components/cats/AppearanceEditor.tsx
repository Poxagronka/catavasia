import type { ReactNode } from 'react';

import {
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

const same = (a: Appearance, b: Appearance) => JSON.stringify(a) === JSON.stringify(b);

/** Draws a look: `undefined` = the pet's own sheet ("Original"). Defaults to agent cats. */
export type PreviewFn = (a: Appearance | undefined, size: 'tile' | 'big') => ReactNode;

const agentPreview: PreviewFn = (a, size) => (
  <CatSprite
    appearance={a ?? {}}
    zoom={size === 'big' ? CAT_EDITOR_ZOOM : CAT_LIST_ZOOM}
    mode={size === 'big' ? 'tour' : 'still'}
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
      onClick={onClick}
      className={`p-1 border-2 rounded-none cursor-pointer bg-bg-dark hover:bg-btn-hover ${
        selected ? 'border-accent' : 'border-transparent'
      }`}
    >
      {children}
    </button>
  );
}

function PresetRow({
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
    <div className="flex flex-col gap-2">
      <span className="text-xs text-text-muted">{title}</span>
      <div className="flex flex-wrap gap-2">
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

function ColorRow({
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
    <label className="flex items-center gap-6 text-xs">
      <input
        type="color"
        value={color}
        onChange={(e) => onChange(e.target.value)}
        className="w-28 h-20 p-0 border-2 border-border bg-bg-dark rounded-none cursor-pointer"
      />
      <span className="w-64">{label}</span>
      {overridden && (
        <button
          className="text-2xs text-text-muted hover:text-text cursor-pointer"
          title="Back to the breed colour"
          onClick={(e) => {
            e.preventDefault();
            onReset();
          }}
        >
          reset
        </button>
      )}
    </label>
  );
}

/**
 * Breed preset or custom coat, with a live animated preview. Shared by agents
 * and pets. Pets pass their own `preview` and `original`: `value` undefined
 * means the pet keeps its own sheet, and the colour fields hide.
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
    <div className="flex gap-12">
      <div className="flex flex-col items-center gap-4 p-8 bg-bg-dark border-2 border-border self-start">
        {preview(own, 'big')}
      </div>
      <div className="flex flex-col gap-8 min-w-0 flex-1">
        <PresetRow
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
        <PresetRow
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
          <div className="flex gap-16 items-start flex-wrap">
            <label className="flex flex-col gap-2 text-xs text-text-muted">
              Pattern
              <select
                className={`${FIELD} text-xs w-120`}
                value={pattern}
                onChange={(e) => onChange({ ...value, pattern: e.target.value as PatternId })}
              >
                {PATTERN_IDS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-x-12 gap-y-4">
              {layers.map((layer) => (
                <ColorRow
                  key={layer}
                  label={LAYER_LABEL[layer]}
                  color={value.colors?.[layer] ?? layerColor(value, layer)}
                  overridden={value.colors?.[layer] !== undefined}
                  onChange={(hex) => setLayer(layer, hex)}
                  onReset={() => setLayer(layer, undefined)}
                />
              ))}
              <ColorRow
                label="Eyes"
                color={value.eyes ?? layerColor(value, 'eyes')}
                overridden={value.eyes !== undefined}
                onChange={(eyes) => onChange({ ...value, eyes })}
                onReset={() => onChange({ ...value, eyes: undefined })}
              />
              <div className="flex items-center gap-6 text-xs">
                {!collarOff && (
                  <ColorRow
                    label="Collar"
                    color={value.collar ?? layerColor(value, 'collar')}
                    overridden={value.collar !== undefined}
                    onChange={(collar) => onChange({ ...value, collar })}
                    onReset={() => onChange({ ...value, collar: undefined })}
                  />
                )}
                <label className="flex items-center gap-4 text-2xs text-text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={collarOff}
                    onChange={() => {
                      if (!collarOff) return onChange({ ...value, collar: 'none' });
                      // Back to the breed collar, or a red one when the breed has none.
                      const own = resolveBreed({ ...value, collar: undefined }).collar;
                      onChange({ ...value, collar: own ? undefined : toHex(DEFAULT_COLLAR) });
                    }}
                  />
                  no collar
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
