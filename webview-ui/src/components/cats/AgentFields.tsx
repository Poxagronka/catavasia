import { type CatProfile, type Engine, ENGINE_LABELS } from '../../cats/catsApi.js';
import { catsApi } from '../../cats/catsClient.js';
import { FIELD } from './fields.js';

function Select({
  label,
  value,
  options,
  labels,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  labels?: Record<string, string>;
  /** Options listed but not selectable. */
  disabled?: (o: string) => boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2 text-xs text-text-muted">
      {label}
      <select
        className={`${FIELD} text-xs`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o} disabled={disabled?.(o) && o !== value}>
            {labels?.[o] ?? o}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Engine labels; an engine the server cannot run yet says so. */
function engineLabels(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(ENGINE_LABELS).map(([engine, label]) => [
      engine,
      catsApi.engineOptions(engine as Engine).unavailable ? `${label} (adapter not ready)` : label,
    ]),
  );
}

/** Agent-only fields: role, engine, model, effort, system prompt. */
export function AgentFields({
  cat,
  onChange,
}: {
  cat: CatProfile;
  onChange: (c: CatProfile) => void;
}) {
  const options = catsApi.engineOptions(cat.engine);
  const setEngine = (engine: Engine) => {
    const next = catsApi.engineOptions(engine);
    onChange({
      ...cat,
      engine,
      model: next.models.includes(cat.model) ? cat.model : next.models[0],
      effort: next.efforts.includes(cat.effort) ? cat.effort : next.efforts[0],
    });
  };
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-8">
        <label className="flex flex-col gap-2 text-xs text-text-muted">
          Role
          <input
            className={`${FIELD} text-xs`}
            value={cat.role}
            placeholder="Team lead, tester..."
            onChange={(e) => onChange({ ...cat, role: e.target.value })}
          />
        </label>
        <Select
          label="Engine"
          value={cat.engine}
          options={Object.keys(ENGINE_LABELS)}
          labels={engineLabels()}
          disabled={(o) => !!catsApi.engineOptions(o as Engine).unavailable}
          onChange={(v) => setEngine(v as Engine)}
        />
        {options.fullModelPattern ? (
          // The CLI also takes a model's full name (claude-...): free text with suggestions.
          <label className="flex flex-col gap-2 text-xs text-text-muted">
            Model
            <input
              className={`${FIELD} text-xs`}
              list="cat-model-options"
              value={cat.model}
              spellCheck={false}
              title="An alias from the list, or a full model name (claude-...)"
              onChange={(e) => onChange({ ...cat, model: e.target.value.trim() })}
            />
            <datalist id="cat-model-options">
              {options.models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
        ) : (
          <Select
            label="Model"
            value={cat.model}
            options={options.models}
            onChange={(model) => onChange({ ...cat, model })}
          />
        )}
        <Select
          label="Effort"
          value={cat.effort}
          options={options.efforts}
          onChange={(effort) => onChange({ ...cat, effort })}
        />
      </div>
      <label className="flex flex-col gap-2 text-xs text-text-muted">
        System prompt
        <textarea
          className={`${FIELD} text-xs h-80 resize-y`}
          value={cat.systemPrompt}
          placeholder="Who is this cat and how does it work? Appended to the engine's system prompt."
          onChange={(e) => onChange({ ...cat, systemPrompt: e.target.value })}
        />
      </label>
    </div>
  );
}
