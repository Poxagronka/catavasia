import type { LanguageCode } from '../../../../core/src/languages.js';
import type { Messages } from '../core.js';
import { messages as ar } from './ar.js';
import { messages as be } from './be.js';
import { messages as bn } from './bn.js';
import { messages as de } from './de.js';
import { messages as en } from './en.js';
import { messages as es } from './es.js';
import { messages as fr } from './fr.js';
import { messages as hi } from './hi.js';
import { messages as id } from './id.js';
import { messages as ja } from './ja.js';
import { messages as ko } from './ko.js';
import { messages as pt } from './pt.js';
import { messages as ru } from './ru.js';
import { messages as tr } from './tr.js';
import { messages as uk } from './uk.js';
import { messages as ur } from './ur.js';
import { messages as zh_Hans } from './zh-Hans.js';

/** Every language of this namespace. A missing language fails check-types. */
export const dictionaries: Record<LanguageCode, Messages> = {
  en: en,
  'zh-Hans': zh_Hans,
  hi: hi,
  es: es,
  fr: fr,
  ar: ar,
  bn: bn,
  pt: pt,
  ru: ru,
  ur: ur,
  id: id,
  de: de,
  ja: ja,
  tr: tr,
  ko: ko,
  uk: uk,
  be: be,
};
