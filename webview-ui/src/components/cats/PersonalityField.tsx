import { CAT_PERSONALITY_IDS } from '../../../../core/src/catPersonality.js';
import type { CatPersonality } from '../../../../core/src/messages.js';
import {
  CAT_PERSONALITY_BLURBS,
  CAT_PERSONALITY_LABELS,
  CAT_PERSONALITY_NONE_BLURB,
} from '../../constants.js';
import { Select } from './AgentFields.js';

const NONE = '';

/**
 * The personality picker of an agent cat, the Cat CEO and a pet: the six
 * presets (and "None" unless `required`), with one line on what the pick does.
 */
export function PersonalityField({
  value,
  required,
  onChange,
}: {
  value?: CatPersonality;
  /** No "None" option (the Cat CEO always has a personality). */
  required?: boolean;
  onChange: (personality: CatPersonality | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-2" data-testid="personality">
      <Select
        label="Personality"
        value={value ?? NONE}
        options={required ? [...CAT_PERSONALITY_IDS] : [NONE, ...CAT_PERSONALITY_IDS]}
        labels={{ [NONE]: 'None', ...CAT_PERSONALITY_LABELS }}
        onChange={(v) => onChange(v === NONE ? undefined : (v as CatPersonality))}
      />
      <span className="text-2xs text-text-muted" data-testid="personality-hint">
        {value ? CAT_PERSONALITY_BLURBS[value] : CAT_PERSONALITY_NONE_BLURB}
      </span>
    </div>
  );
}
