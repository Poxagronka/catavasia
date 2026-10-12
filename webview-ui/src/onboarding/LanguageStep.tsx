import { type LanguageCode, LANGUAGES } from '../../../core/src/languages.js';
import { useLanguage } from '../i18n/languageStore.js';
import { chooseLanguage } from '../i18n/languageSync.js';
import { onboarding } from '../i18n/onboarding/en.js';
import { useT } from '../i18n/useT.js';

/**
 * Step 1: pick the UI language. Each language shows by its own name, no flags. The selection starts at the
 * language detected from the locale (the language store), so Next alone keeps the detected one: the shell
 * persists it with chooseLanguage when the user leaves this step.
 */
export function LanguageStep() {
  const t = useT(onboarding);
  const language = useLanguage();
  return (
    <div className="flex flex-col gap-8">
      <p className="prose-body m-0">{t('languageHint')}</p>
      <div
        role="radiogroup"
        aria-label={t('languageTitle')}
        className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4"
      >
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            role="radio"
            aria-checked={l.code === language}
            lang={l.code}
            dir={l.rtl ? 'rtl' : 'ltr'}
            onClick={() => chooseLanguage(l.code as LanguageCode)}
            className={`py-4 px-8 text-start border-2 rounded-none cursor-pointer text-text ${
              l.code === language
                ? 'bg-active-bg border-accent'
                : 'bg-btn-bg border-transparent hover:bg-btn-hover'
            }`}
          >
            {l.endonym}
          </button>
        ))}
      </div>
    </div>
  );
}
