import {
  BREED_PRESETS,
  breedPattern,
  COAT_PRESETS,
  layerColor,
  type Preset,
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

const same = (a: Appearance, b: Appearance) => JSON.stringify(a) === JSON.stringify(b);

function PresetRow({
  title,
  presets,
  value,
  onPick,
}: {
  title: string;
  presets: Preset[];
  value: Appearance;
  onPick: (a: Appearance) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-text-muted">{title}</span>
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.id}
            title={`${p.name} (${p.label})`}
            onClick={() => onPick(p.appearance)}
            className={`p-1 border-2 rounded-none cursor-pointer bg-bg-dark hover:bg-btn-hover ${
              same(p.appearance, value) ? 'border-accent' : 'border-transparent'
            }`}
          >
            <CatSprite appearance={p.appearance} zoom={CAT_LIST_ZOOM} />
          </button>
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

/** Breed preset or custom coat, with a live animated preview. Shared by agents and pets. */
export function AppearanceEditor({
  value,
  onChange,
}: {
  value: Appearance;
  onChange: (a: Appearance) => void;
}) {
  const pattern = value.pattern ?? breedPattern(value.breed);
  const layers: Array<keyof ColorLayers> = ['fur', 'belly', ...MARKINGS[pattern]];
  const setLayer = (layer: keyof ColorLayers, hex: string | undefined) => {
    const colors = { ...value.colors, [layer]: hex };
    if (hex === undefined) delete colors[layer];
    onChange({ ...value, colors });
  };
  const collarOff = value.collar === 'none';

  return (
    <div className="flex gap-12">
      <div className="flex flex-col items-center gap-4 p-8 bg-bg-dark border-2 border-border self-start">
        <CatSprite appearance={value} zoom={CAT_EDITOR_ZOOM} mode="tour" />
      </div>
      <div className="flex flex-col gap-8 min-w-0 flex-1">
        <PresetRow title="Breeds" presets={BREED_PRESETS} value={value} onPick={onChange} />
        <PresetRow title="Coats" presets={COAT_PRESETS} value={value} onPick={onChange} />
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
                  onChange={() => onChange({ ...value, collar: collarOff ? undefined : 'none' })}
                />
                no collar
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
