/**
 * The i18n layer: the language list, locale detection, key fallback and dictionary completeness.
 * Every <namespace>/<language>.ts file must hold exactly the keys of <namespace>/en.ts.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LANGUAGE,
  detectLanguage,
  isRtlLanguage,
  LANGUAGES,
} from '../../core/src/languages.js';
import { common } from '../src/i18n/common/en.js';
import { interpolate } from '../src/i18n/core.js';
import { loadedNamespaces, translate } from '../src/i18n/dictionaries.js';
import { getLanguage, setLanguageLocal } from '../src/i18n/languageStore.js';

describe('languages', () => {
  it('lists 17 languages with unique codes and endonyms', () => {
    expect(LANGUAGES).toHaveLength(17);
    expect(new Set(LANGUAGES.map((l) => l.code)).size).toBe(17);
    expect(new Set(LANGUAGES.map((l) => l.endonym)).size).toBe(17);
  });

  it('marks only Arabic and Urdu right-to-left', () => {
    expect(LANGUAGES.filter((l) => l.rtl).map((l) => l.code)).toEqual(['ar', 'ur']);
    expect(isRtlLanguage('ar')).toBe(true);
    expect(isRtlLanguage('ru')).toBe(false);
  });

  it('detects the language from a locale tag', () => {
    expect(detectLanguage('pt-BR')).toBe('pt');
    expect(detectLanguage('zh-TW')).toBe('zh-Hans');
    expect(detectLanguage('RU')).toBe('ru');
    expect(detectLanguage('nb-NO')).toBe(DEFAULT_LANGUAGE);
    expect(detectLanguage(undefined)).toBe(DEFAULT_LANGUAGE);
  });
});

describe('translate', () => {
  it('uses the chosen language, falls back to English, then to the key', () => {
    expect(translate(common, 'language', 'ru')).toBe('Язык');
    expect(translate(common, 'language', 'en')).toBe('Language');
    expect(translate({ name: 'common', messages: {} }, 'nope', 'ru')).toBe('nope');
  });

  it('fills {placeholders} and keeps unknown ones', () => {
    expect(interpolate('Hi {name}, {x}', { name: 'Ada' })).toBe('Hi Ada, {x}');
  });
});

describe('language store', () => {
  it('changes the current language', () => {
    setLanguageLocal('de');
    expect(getLanguage()).toBe('de');
    setLanguageLocal('en');
  });
});

describe('dictionary completeness', () => {
  const english = loadedNamespaces('en');

  it('has an English dictionary for every namespace', () => {
    const names = new Set<string>();
    for (const lang of LANGUAGES) {
      for (const name of loadedNamespaces(lang.code).keys()) names.add(name);
    }
    for (const name of names) expect(english.has(name), `${name}/en.ts`).toBe(true);
  });

  it('keeps every translation file on exactly the English keys', () => {
    for (const lang of LANGUAGES) {
      for (const [name, messages] of loadedNamespaces(lang.code)) {
        const keys = Object.keys(english.get(name) ?? {}).sort();
        expect(Object.keys(messages).sort(), `${name}/${lang.code}.ts`).toEqual(keys);
      }
    }
  });

  it('gives common every language with exactly the English keys', () => {
    const keys = Object.keys(english.get('common') ?? {}).sort();
    for (const lang of LANGUAGES) {
      const messages = loadedNamespaces(lang.code).get('common');
      expect(messages, `common/${lang.code}.ts`).toBeDefined();
      expect(Object.keys(messages ?? {}).sort()).toEqual(keys);
    }
  });
});
