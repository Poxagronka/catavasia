import { PERMISSION_MODE_LABELS, permissionHint } from '../../../core/src/permissionModes.js';
import { catCeo, type CeoSettings } from '../cats/catCeoClient.js';
import { catsApi } from '../cats/catsClient.js';
import { PermissionModeField } from '../components/cats/PermissionModeField.js';
import { ComposerMenu } from './ComposerMenu.js';
import { settingLabel } from './dockState.js';

/** A list of choices in a composer menu; the current one has a check mark. */
function Choices({
  hint,
  value,
  options,
  onPick,
  testId,
}: {
  hint: string;
  value: string;
  options: string[];
  onPick(v: string): void;
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="prose-small text-text-muted px-6 pb-4">{hint}</span>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className={`composer-choice ${o === value ? 'is-current' : ''}`}
          onClick={() => onPick(o)}
          data-testid={`${testId}-${o}`}
        >
          <span className="flex-1 text-left">{settingLabel(o)}</span>
          {o === value && <span aria-hidden>✓</span>}
        </button>
      ))}
    </div>
  );
}

const set = (patch: Partial<CeoSettings>) => catCeo.setSettings(patch);

/** "Auto": the CEO's permission mode; it opens the mode picker of the CEO settings. */
export function ModePicker({ settings }: { settings: CeoSettings }) {
  const mode = settings.permissionMode ?? 'auto';
  return (
    <ComposerMenu
      label={PERMISSION_MODE_LABELS[mode]}
      title={`What the CEO may do without asking: ${permissionHint('claude', settings.model, mode)}`}
      testId="dock-mode"
    >
      {() => (
        <PermissionModeField
          engine="claude"
          model={settings.model}
          value={mode}
          onChange={(permissionMode) => set({ permissionMode })}
        />
      )}
    </ComposerMenu>
  );
}

/** The CEO's model and effort ("Opus 5.5", "Medium"); each opens its list. */
export function ModelPickers({ settings }: { settings: CeoSettings }) {
  const options = catsApi.engineOptions('claude');
  const models = options.models.includes(settings.model)
    ? options.models
    : [settings.model, ...options.models];
  return (
    <>
      <ComposerMenu
        label={settingLabel(settings.model)}
        title="The model the CEO thinks with"
        testId="dock-model"
        align="right"
      >
        {(close) => (
          <Choices
            hint="The model the CEO thinks with. Bigger models are smarter and slower."
            value={settings.model}
            options={models}
            onPick={(model) => {
              set({ model });
              close();
            }}
            testId="dock-model"
          />
        )}
      </ComposerMenu>
      {options.efforts.length > 0 && (
        <ComposerMenu
          label={settingLabel(settings.effort)}
          title="How long the CEO thinks before it answers"
          testId="dock-effort"
          align="right"
        >
          {(close) => (
            <Choices
              hint="How long the CEO thinks before it answers. More effort is slower and more careful."
              value={settings.effort}
              options={options.efforts}
              onPick={(effort) => {
                set({ effort });
                close();
              }}
              testId="dock-effort"
            />
          )}
        </ComposerMenu>
      )}
    </>
  );
}
