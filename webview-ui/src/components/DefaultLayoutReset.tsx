import { chrome } from '../i18n/chrome/en.js';
import type { MessageKey, Params } from '../i18n/core.js';
import { translate } from '../i18n/dictionaries.js';
import { getLanguage } from '../i18n/languageStore.js';
import { Button } from './ui/Button.js';

interface DefaultLayoutResetProps {
  label: string;
  /** Confirm state lives in the caller, so this stays a pure function of props. */
  confirming: boolean;
  onConfirmingChange: (confirming: boolean) => void;
  /** Runs only after the user answers Yes. */
  onReset: () => void;
}

/** Shared "replace with the default layout" button + inline Yes/No confirm. */
export function DefaultLayoutReset({
  label,
  confirming,
  onConfirmingChange,
  onReset,
}: DefaultLayoutResetProps) {
  // Not a hook: these components stay pure functions of props. The parent re-renders on a language change.
  const t = (key: MessageKey<typeof chrome>, params?: Params) =>
    translate(chrome, key, getLanguage(), params);
  if (!confirming) {
    return (
      <Button
        variant="default"
        size="md"
        onClick={() => onConfirmingChange(true)}
        title={t('defaultLayoutTitle')}
      >
        {label}
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap gap-4 items-center">
      <span className="text-base text-reset-text">{t('replaceConfirm')}</span>
      <Button
        variant="default"
        size="md"
        className="bg-danger text-white"
        onClick={() => {
          onConfirmingChange(false);
          onReset();
        }}
      >
        {t('yes')}
      </Button>
      <Button variant="default" size="md" onClick={() => onConfirmingChange(false)}>
        {t('no')}
      </Button>
    </div>
  );
}
