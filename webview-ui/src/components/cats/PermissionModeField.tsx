import type { CatEngine, PermissionMode } from '../../../../core/src/messages.js';
import {
  DEFAULT_PERMISSION_MODE,
  PERMISSION_MODE_LABELS,
  PERMISSION_MODES,
  permissionHint,
} from '../../../../core/src/permissionModes.js';
import { Select } from './AgentFields.js';

/**
 * The permission mode picker of a cat and of the Cat CEO: the four modes in
 * plain words, with one line under it that says what the picked mode does
 * (and when this model runs Auto as Bypass).
 */
export function PermissionModeField({
  engine,
  model,
  value = DEFAULT_PERMISSION_MODE,
  onChange,
}: {
  engine: CatEngine;
  model: string;
  value?: PermissionMode;
  onChange: (mode: PermissionMode) => void;
}) {
  return (
    <div className="flex flex-col gap-2" data-testid="permission-mode">
      <Select
        label="Permissions"
        value={value}
        options={[...PERMISSION_MODES]}
        labels={PERMISSION_MODE_LABELS}
        onChange={(v) => onChange(v as PermissionMode)}
      />
      <span className="text-2xs text-text-muted" data-testid="permission-hint">
        {permissionHint(engine, model, value)}
      </span>
    </div>
  );
}
