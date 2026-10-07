import { useState } from 'react';

import { catCeo, type CeoSettings } from '../../cats/catCeoClient.js';
import { catsApi } from '../../cats/catsClient.js';
import { useCats } from '../../cats/useCats.js';
import { CAT_CEO_ID } from '../../constants.js';
import { Select } from './AgentFields.js';
import { AppearanceEditor } from './AppearanceEditor.js';
import { FIELD } from './fields.js';
import { PermissionModeField } from './PermissionModeField.js';
import { PersonalityField } from './PersonalityField.js';
import { PromptHistory } from './PromptHistory.js';

/** A text field that saves on blur (each save of the Role is a commit). */
function useBlurDraft(saved: string, save: (v: string) => void) {
  const [draft, setDraft] = useState<string | null>(null);
  return {
    value: draft ?? saved,
    onChange: (v: string) => setDraft(v),
    onBlur: () => {
      if (draft !== null && draft !== saved) save(draft);
      setDraft(null);
    },
  };
}

/**
 * The Cat CEO in the Cats menu: name, look, model, effort, permissions, its Role, the
 * daily edit limit, the on/off switch, and the history of its own prompt.
 * It is not a cat of the tree: it cannot be deleted, only turned off.
 */
export function CeoEditor({ settings }: { settings: CeoSettings }) {
  const { rejected } = useCats();
  const options = catsApi.engineOptions('claude');
  const set = (patch: Partial<CeoSettings>) => catCeo.setSettings(patch);
  const name = useBlurDraft(settings.name, (v) => set({ name: v }));
  const role = useBlurDraft(settings.systemPrompt, (v) => set({ systemPrompt: v }));
  const error = rejected && (!rejected.id || rejected.id === CAT_CEO_ID) ? rejected.error : null;
  return (
    <div className="flex flex-col gap-10 flex-1 min-w-0" data-testid="ceo-editor">
      <div className="flex gap-8 items-center">
        <input
          className={`${FIELD} text-lg flex-1`}
          value={name.value}
          onChange={(e) => name.onChange(e.target.value)}
          onBlur={name.onBlur}
          spellCheck={false}
        />
        <label className="flex gap-4 items-center text-xs text-text cursor-pointer">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
          />
          Cat CEO reviews
        </label>
      </div>
      {error && <div className="text-xs text-status-error">{error}</div>}
      <div className="text-xs text-text-muted">
        Sits above the boss. After each finished team task it scores every cat and may add, replace
        or remove Rules and Lessons items (never Role & conduct). It also tidies each cat&apos;s
        items (merge, rewrite, remove) near the caps, every 10 reviews, weekly, or on &quot;Tidy
        now&quot;. Turn it off to stop the reviews; it cannot be deleted while it is on.
      </div>
      <div className="grid grid-cols-3 gap-8">
        <Select
          label="Model"
          value={settings.model}
          options={
            options.models.includes(settings.model)
              ? options.models
              : [settings.model, ...options.models]
          }
          onChange={(model) => set({ model })}
        />
        <Select
          label="Effort"
          value={settings.effort}
          options={options.efforts}
          onChange={(effort) => set({ effort })}
        />
        <label className="flex flex-col gap-2 text-xs text-text-muted">
          Edits per cat per day
          <input
            type="number"
            min={0}
            max={10}
            className={`${FIELD} text-xs`}
            value={settings.maxEditsPerCatPerDay}
            onChange={(e) => {
              const n = e.target.valueAsNumber;
              if (Number.isInteger(n)) set({ maxEditsPerCatPerDay: n });
            }}
          />
        </label>
      </div>
      <PermissionModeField
        engine="claude"
        model={settings.model}
        value={settings.permissionMode}
        onChange={(permissionMode) => set({ permissionMode })}
      />
      <label className="flex gap-4 items-center text-xs text-text cursor-pointer">
        <input
          type="checkbox"
          checked={settings.tidyUserItems}
          onChange={(e) => set({ tidyUserItems: e.target.checked })}
        />
        CEO may tidy my items (merge and rewrite the Rules and Lessons you wrote; it never removes
        them, it only marks them)
      </label>
      <label className="flex flex-col gap-2 text-xs text-text-muted">
        Role & conduct (only you edit it)
        <textarea
          className={`${FIELD} text-xs h-80 resize-y`}
          value={role.value}
          onChange={(e) => role.onChange(e.target.value)}
          onBlur={role.onBlur}
        />
      </label>
      <PersonalityField
        value={settings.personality}
        required
        onChange={(personality) => personality && set({ personality })}
      />
      <AppearanceEditor
        value={settings.appearance}
        onChange={(appearance) => set({ appearance })}
      />
      <div className="flex flex-col gap-4">
        <span className="text-xs text-text-muted">Prompt history of the Cat CEO</span>
        <PromptHistory catId={CAT_CEO_ID} />
      </div>
    </div>
  );
}
