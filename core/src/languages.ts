/**
 * UI languages (owner decision 2026-10-12, docs/catavasia/ROADMAP.md "Onboarding and 17 languages").
 * Each language shows by its own name (endonym), never with a flag. Shared by the webview (t(), the
 * pickers) and the server (validates the `language` setting, picks narrator and bubble copy).
 */

export interface LanguageInfo {
  /** BCP 47 tag, also the dictionary file name: webview-ui/src/i18n/<namespace>/<code>.ts */
  readonly code: string;
  /** The language written in itself. */
  readonly endonym: string;
  /** Right-to-left script: the webview sets dir="rtl". */
  readonly rtl: boolean;
}

export const LANGUAGES = [
  { code: 'en', endonym: 'English', rtl: false },
  { code: 'zh-Hans', endonym: '中文', rtl: false },
  { code: 'hi', endonym: 'हिन्दी', rtl: false },
  { code: 'es', endonym: 'Español', rtl: false },
  { code: 'fr', endonym: 'Français', rtl: false },
  { code: 'ar', endonym: 'العربية', rtl: true },
  { code: 'bn', endonym: 'বাংলা', rtl: false },
  { code: 'pt', endonym: 'Português', rtl: false },
  { code: 'ru', endonym: 'Русский', rtl: false },
  { code: 'ur', endonym: 'اردو', rtl: true },
  { code: 'id', endonym: 'Bahasa Indonesia', rtl: false },
  { code: 'de', endonym: 'Deutsch', rtl: false },
  { code: 'ja', endonym: '日本語', rtl: false },
  { code: 'tr', endonym: 'Türkçe', rtl: false },
  { code: 'ko', endonym: '한국어', rtl: false },
  { code: 'uk', endonym: 'Українська', rtl: false },
  { code: 'be', endonym: 'Беларуская', rtl: false },
] as const satisfies readonly LanguageInfo[];

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

/** The `language` setting value for "never chosen": the webview then detects it from the locale. */
export const LANGUAGE_UNSET = '';

export function isLanguageCode(value: unknown): value is LanguageCode {
  return LANGUAGES.some((l) => l.code === value);
}

export function isRtlLanguage(code: LanguageCode): boolean {
  return LANGUAGES.some((l) => l.code === code && l.rtl);
}

/**
 * Map a locale tag (navigator.language, VS Code locale) to a supported language.
 * "pt-BR" -> pt, "zh-TW" -> zh-Hans (the only Chinese we ship), "nb" -> en.
 */
export function detectLanguage(locale: string | undefined | null): LanguageCode {
  if (!locale) return DEFAULT_LANGUAGE;
  const primary = locale.toLowerCase().split(/[-_]/)[0];
  if (primary === 'zh') return 'zh-Hans';
  const found = LANGUAGES.find((l) => l.code.toLowerCase() === primary);
  return found ? found.code : DEFAULT_LANGUAGE;
}
