import type { PermissionMode } from '../../../core/src/messages.js';
import {
  AUTO_FALLBACK_HINT,
  autoSupported,
  modeHint,
  PERMISSION_MODE_LABELS,
  PERMISSION_MODES,
  permissionHint,
} from '../../../core/src/permissionModes.js';
import { catCeo, type CeoSettings } from '../cats/catCeoClient.js';
import { catsApi } from '../cats/catsClient.js';
import { ComposerMenu } from './ComposerMenu.js';
import { settingLabel } from './dockState.js';

/**
 * A list of choices in a composer menu (the Claude app look): a name, an
 * optional plain line under it, and a check mark on the current one.
 */
function Choices({
  note,
  value,
  options,
  onPick,
  testId,
}: {
  note?: string;
  value: string;
  options: { value: string; label: string; hint?: string }[];
  onPick(v: string): void;
  testId: string;
}) {
  return (
    <div className="composer-list prose-body" role="menu">
      {note && <span className="composer-note">{note}</span>}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="menuitemradio"
          aria-checked={o.value === value}
          className="composer-choice"
          onClick={() => onPick(o.value)}
          data-testid={`${testId}-${o.value}`}
        >
          <span className="flex-1 flex flex-col text-left">
            <span className="composer-choice-label">{o.label}</span>
            {o.hint && <span className="composer-choice-hint">{o.hint}</span>}
          </span>
          <span className="composer-check" aria-hidden>
            {o.value === value ? '✓' : ''}
          </span>
        </button>
      ))}
    </div>
  );
}

const set = (patch: Partial<CeoSettings>) => catCeo.setSettings(patch);

/** "Auto": the CEO's permission mode; it opens the mode picker of the CEO settings. */
export function ModePicker({ settings, openKey }: { settings: CeoSettings; openKey?: number }) {
  const mode = settings.permissionMode ?? 'auto';
  return (
    <ComposerMenu
      label={PERMISSION_MODE_LABELS[mode]}
      title={`What the CEO may do without asking: ${permissionHint('claude', settings.model, mode)}`}
      testId="dock-mode"
      openKey={openKey}
    >
      {(close) => (
        <Choices
          note={autoSupported(settings.model) ? undefined : AUTO_FALLBACK_HINT}
          value={mode}
          options={PERMISSION_MODES.map((m) => ({
            value: m,
            label: PERMISSION_MODE_LABELS[m],
            hint: modeHint('claude', m),
          }))}
          onPick={(m) => {
            set({ permissionMode: m as PermissionMode });
            close();
          }}
          testId="dock-mode"
        />
      )}
    </ComposerMenu>
  );
}

/** The CEO's model and effort ("Opus 5.5", "Medium"); each opens its list. */
export function ModelPickers({
  settings,
  openKeys,
}: {
  settings: CeoSettings;
  /** A slash command opens the model or the effort list. */
  openKeys?: { model?: number; effort?: number };
}) {
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
        openKey={openKeys?.model}
      >
        {(close) => (
          <Choices
            note="The model the CEO thinks with. Bigger models are smarter and slower."
            value={settings.model}
            options={models.map((m) => ({ value: m, label: settingLabel(m) }))}
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
          openKey={openKeys?.effort}
        >
          {(close) => (
            <Choices
              note="How long the CEO thinks before it answers. More effort is slower and more careful."
              value={settings.effort}
              options={options.efforts.map((e) => ({ value: e, label: settingLabel(e) }))}
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
