import { describe, expect, it } from 'vitest';

import { LANGUAGES } from '../../core/src/languages.js';
import { deskPersona } from '../src/ceoDesk/deskPrompt.js';
import { consent } from '../src/i18n/consent/en.js';
import { narrator } from '../src/i18n/narrator/en.js';
import { REGISTRY, translate } from '../src/i18n/translate.js';
import {
  filterSummary,
  SUMMARY_SYSTEM_PROMPT,
  summarySystemPrompt,
} from '../src/narrator/schema.js';
import { templateFor } from '../src/narrator/templates.js';
import { consentCopy } from '../src/providers/hook/claude/consentCopy.js';

const PLACEHOLDER = /\{\w+\}/g;
const sorted = (text: string) => (text.match(PLACEHOLDER) ?? []).sort().join(',');

describe('server i18n dictionaries', () => {
  for (const [name, dicts] of Object.entries(REGISTRY)) {
    const en = dicts.en;
    it.each(LANGUAGES.map((l) => l.code))(
      `${name}: %s has exactly the English keys and placeholders`,
      (code) => {
        const dict = dicts[code];
        expect(Object.keys(dict).sort()).toEqual(Object.keys(en).sort());
        for (const key of Object.keys(en)) {
          expect(dict[key].trim(), `${name}/${code}/${key}`).not.toBe('');
          expect(sorted(dict[key]), `${name}/${code}/${key}`).toBe(sorted(en[key]));
        }
      },
    );
  }

  it('falls back to English for an unset or unknown language', () => {
    expect(translate(narrator, 'done', '')).toBe('purring, all done');
    expect(translate(narrator, 'done', 'xx')).toBe('purring, all done');
    expect(translate(narrator, 'done', 'ru')).toBe('мурлычет, всё готово');
  });

  it('every narrator line fits the line limit in every language', () => {
    for (const { code } of LANGUAGES) {
      for (const key of Object.keys(narrator.messages) as Array<keyof typeof narrator.messages>) {
        expect(translate(narrator, key, code).length).toBeLessThanOrEqual(60);
      }
    }
  });
});

describe('language follows the setting', () => {
  it('status lines use the chosen language', () => {
    const input = { catId: 1, ts: 0, kind: 'state', text: 'done' } as const;
    expect(templateFor(input)?.line).toBe('purring, all done');
    expect(templateFor(input, 'de')?.line).toBe('schnurrt, alles fertig');
  });

  it('the consent ask keeps the same facts in every language', () => {
    const en = consentCopy('en');
    for (const { code } of LANGUAGES) {
      const copy = consentCopy(code);
      expect(copy.disclosure.split('\n\n')).toHaveLength(3);
      expect(copy.disclosure).toContain('~/.claude/settings.json');
      expect(copy.disclosure).toContain('127.0.0.1');
      expect(copy.disclosure).not.toMatch(PLACEHOLDER);
      if (code !== 'en') expect(copy.headline).not.toBe(en.headline);
    }
    expect(consentCopy('').disclosure).toBe(en.disclosure);
    expect(consent.messages.headline).toBe(en.headline);
  });

  it('the summary prompt asks for the chosen language and English stays unchanged', () => {
    expect(summarySystemPrompt('')).toBe(SUMMARY_SYSTEM_PROMPT);
    expect(summarySystemPrompt('ru')).toContain('Русский (language code ru)');
    expect(summarySystemPrompt('ru')).not.toContain('in English');
  });

  it('the validator accepts the chosen script and still drops invented numbers', () => {
    const lines = ['Мурка → Барсик: проверь тесты'];
    expect(filterSummary('Мурка просит Барсика проверить тесты.', lines, 'ru')).toBe(
      'Мурка просит Барсика проверить тесты.',
    );
    expect(filterSummary('Мурка просит Барсика проверить тесты.', lines)).toBe('');
    expect(filterSummary('Мурка проверила 42 теста.', lines, 'ru')).toBe('');
    expect(filterSummary('猫咪检查了测试 ✓', lines, 'zh-Hans')).toBe('');
  });

  it('the CEO persona names the chosen language and English stays unchanged', () => {
    expect(deskPersona('Boss', '')).toBe(deskPersona('Boss', '', 'en'));
    expect(deskPersona('Boss', '', 'ja')).toContain('日本語 (language code ja)');
  });
});
