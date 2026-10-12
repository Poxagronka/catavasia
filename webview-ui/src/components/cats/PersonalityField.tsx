import { CAT_PERSONALITY_IDS } from '../../../../core/src/catPersonality.js';
import type { CatPersonality } from '../../../../core/src/messages.js';
import { cats } from '../../i18n/cats/en.js';
import { useT } from '../../i18n/useT.js';
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
  const t = useT(cats);
  return (
    <div className="flex flex-col gap-2" data-testid="personality">
      <Select
        label={t('personality')}
        value={value ?? NONE}
        options={required ? [...CAT_PERSONALITY_IDS] : [NONE, ...CAT_PERSONALITY_IDS]}
        labels={Object.fromEntries([
          [NONE, t('personality_none')],
          ...CAT_PERSONALITY_IDS.map((p) => [p, t(`personality_${p}` as const)]),
        ])}
        onChange={(v) => onChange(v === NONE ? undefined : (v as CatPersonality))}
      />
      <span className="text-2xs text-text-muted" data-testid="personality-hint">
        {value ? t(`personalityBlurb_${value}` as const) : t('personalityBlurb_none')}
      </span>
    </div>
  );
}
