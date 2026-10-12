/**
 * The current UI language: a tiny external store (no provider needed) that also keeps <html lang> and
 * <html dir> in step. Pure on purpose, so tests can import it. The server sync lives in languageSync.ts.
 */

import { useSyncExternalStore } from 'react';

import { detectLanguage, isRtlLanguage, type LanguageCode } from '../../../core/src/languages.js';

/** The language the browser or VS Code locale suggests. */
export function detectedLanguage(): LanguageCode {
  return detectLanguage(typeof navigator === 'undefined' ? undefined : navigator.language);
}

let current: LanguageCode = detectedLanguage();
const listeners = new Set<() => void>();

function applyToDocument(code: LanguageCode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = code;
  document.documentElement.dir = isRtlLanguage(code) ? 'rtl' : 'ltr';
}

applyToDocument(current);

export function getLanguage(): LanguageCode {
  return current;
}

/** Change the language in this webview only. Use chooseLanguage() (languageSync.ts) to persist it. */
export function setLanguageLocal(code: LanguageCode): void {
  if (code === current) return;
  current = code;
  applyToDocument(code);
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current language; the component re-renders when it changes. */
export function useLanguage(): LanguageCode {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage);
}
