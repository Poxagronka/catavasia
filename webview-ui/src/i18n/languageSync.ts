/**
 * Keeps the language store and the persisted `language` setting in step. Importing this file (main.tsx
 * does) subscribes to settingsLoaded, so the saved choice replaces the detected default on connect.
 */

import { isLanguageCode, type LanguageCode } from '../../../core/src/languages.js';
import { transport } from '../transport/index.js';
import { setLanguageLocal } from './languageStore.js';

transport.onMessage((msg) => {
  if (msg.type === 'settingsLoaded' && isLanguageCode(msg.language)) {
    setLanguageLocal(msg.language);
  }
});

/** The user picked a language: switch now and persist it (the server follows it too). */
export function chooseLanguage(code: LanguageCode): void {
  setLanguageLocal(code);
  transport.send({ type: 'setLanguage', language: code });
}
