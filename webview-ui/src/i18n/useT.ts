import { useCallback } from 'react';

import type { MessageKey, Namespace, Params } from './core.js';
import { translate } from './dictionaries.js';
import { useLanguage } from './languageStore.js';

/**
 * `const t = useT(common); t('language')`. Keys are typed from the namespace declared in
 * i18n/<name>/en.ts. The component re-renders when the language changes.
 */
export function useT<N extends Namespace>(ns: N) {
  const language = useLanguage();
  return useCallback(
    (key: MessageKey<N>, params?: Params) => translate(ns, key, language, params),
    [ns, language],
  );
}
