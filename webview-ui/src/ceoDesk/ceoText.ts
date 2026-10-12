import { ceoDesk } from '../i18n/ceoDesk/en.js';
import type { MessageKey, Params } from '../i18n/core.js';
import { translate } from '../i18n/dictionaries.js';
import { getLanguage } from '../i18n/languageStore.js';

/** Text of the CEO dock for plain modules (no hook): the chosen language, read at call time. */
export function ceoText(key: MessageKey<typeof ceoDesk>, params?: Params): string {
  return translate(ceoDesk, key, getLanguage(), params);
}
