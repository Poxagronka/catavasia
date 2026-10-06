import { type CatProfile, type Engine, ENGINE_LABELS } from '../../cats/catsApi.js';
import { catsApi } from '../../cats/localCatsAdapter.js';
import { FIELD } from './fields.js';

function Select({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  labels?: Record<string, string>;
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
          <option key={o} value={o}>
            {labels?.[o] ?? o}
          </option>
        ))}
      </select>
    </label>
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
          labels={ENGINE_LABELS}
          onChange={(v) => setEngine(v as Engine)}
        />
        <Select
          label="Model"
          value={cat.model}
          options={options.models}
          onChange={(model) => onChange({ ...cat, model })}
        />
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
