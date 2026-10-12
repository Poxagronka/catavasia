/**
 * Server-side t(). Dictionaries sit in server/src/i18n/<namespace>/<language>.ts and are listed statically in each
 * namespace's index.ts (the server has no bundler glob). The language setting comes from getLanguage(adapter);
 * '' (never chosen) and any unknown value mean English.
 */

import {
  DEFAULT_LANGUAGE,
  isLanguageCode,
  type LanguageCode,
  LANGUAGES,
} from '../../../core/src/languages.js';
import { dictionaries as consentDictionaries } from './consent/index.js';
import type { Messages } from './core.js';
import { interpolate, type MessageKey, type Namespace, type Params } from './core.js';
import { dictionaries as narratorDictionaries } from './narrator/index.js';

/** Namespace name -> its dictionaries. Add a namespace here when you add its folder. */
export const REGISTRY: Record<string, Record<LanguageCode, Messages>> = {
  consent: consentDictionaries,
  narrator: narratorDictionaries,
};

/** A stored language value as a code: unknown or unset becomes English. */
export function toLanguage(value: unknown): LanguageCode {
  return isLanguageCode(value) ? value : DEFAULT_LANGUAGE;
}

/** The message for a key: chosen language, then English, then the key itself. */
export function translate<N extends Namespace>(
  ns: N,
  key: MessageKey<N>,
  language: unknown,
  params?: Params,
): string {
  const dicts = REGISTRY[ns.name];
  const text =
    dicts?.[toLanguage(language)][key] ?? dicts?.[DEFAULT_LANGUAGE][key] ?? ns.messages[key];
  return interpolate(text ?? key, params);
}

/** The language written in itself, for an instruction to a model ("write in Русский"). */
export function languageEndonym(language: unknown): string {
  const code = toLanguage(language);
  return LANGUAGES.find((l) => l.code === code)?.endonym ?? code;
}
