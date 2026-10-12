import { useState } from 'react';

import { type LanguageCode, LANGUAGES } from '../../../../core/src/languages.js';
import { chrome } from '../../i18n/chrome/en.js';
import { common } from '../../i18n/common/en.js';
import { useLanguage } from '../../i18n/languageStore.js';
import { chooseLanguage } from '../../i18n/languageSync.js';
import { useT } from '../../i18n/useT.js';
import { isSoundEnabled, setSoundEnabled } from '../../notificationSound.js';
import { restartOnboarding } from '../../onboarding/onboardingStore.js';
import { transport } from '../../transport/index.js';
import { Checkbox } from '../ui/Checkbox.js';
import { MenuItem } from '../ui/MenuItem.js';

interface GeneralTabProps {
  onClose: () => void;
  alwaysShowOverlay: boolean;
  onToggleAlwaysShowOverlay: () => void;
}

/** Language, onboarding, sound and labels. */
export function GeneralTab({
  onClose,
  alwaysShowOverlay,
  onToggleAlwaysShowOverlay,
}: GeneralTabProps) {
  const t = useT(common);
  const tc = useT(chrome);
  const language = useLanguage();
  const [soundLocal, setSoundLocal] = useState(isSoundEnabled);
  return (
    <>
      <label className="flex items-center justify-between w-full py-6 px-10">
        <span>{t('language')}</span>
        <select
          value={language}
          onChange={(e) => chooseLanguage(e.target.value as LanguageCode)}
          className="bg-bg border-2 border-border rounded-none text-text text-xs py-2 px-4"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.endonym}
            </option>
          ))}
        </select>
      </label>
      <MenuItem
        onClick={() => {
          restartOnboarding();
          onClose();
        }}
      >
        {t('runOnboardingAgain')}
      </MenuItem>
      <Checkbox
        label={tc('soundNotifications')}
        checked={soundLocal}
        onChange={() => {
          const newVal = !isSoundEnabled();
          setSoundEnabled(newVal);
          setSoundLocal(newVal);
          transport.send({ type: 'setSoundEnabled', enabled: newVal });
        }}
      />
      <Checkbox
        label={tc('alwaysShowLabels')}
        checked={alwaysShowOverlay}
        onChange={onToggleAlwaysShowOverlay}
      />
    </>
  );
}
