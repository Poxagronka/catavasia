// Translated text for plain TypeScript in this folder (validation errors, hints).
// React components call `useT(cats)` instead.

import { cats } from '../i18n/cats/en.js';
import { translate } from '../i18n/dictionaries.js';
import { getLanguage } from '../i18n/languageStore.js';

type CatsKey = keyof typeof cats.messages;

export function catsText(key: CatsKey, params?: Record<string, string | number>): string {
  return translate(cats, key, getLanguage(), params);
}
