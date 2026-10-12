/**
 * Loads every dictionary file: webview-ui/src/i18n/<namespace>/<language>.ts, each exporting `messages`.
 * The glob means a new namespace or language needs no registry edit, so parallel work never collides.
 */

import { DEFAULT_LANGUAGE, type LanguageCode } from '../../../core/src/languages.js';
import { interpolate, type Messages, type Namespace, type Params } from './core.js';

const modules = import.meta.glob<{ messages?: Messages }>('./*/*.ts', { eager: true });

const FILE_PATTERN = /^\.\/([^/]+)\/([^/]+)\.ts$/;

/** `${namespace}/${language}` -> messages. */
const table = new Map<string, Messages>();
for (const [file, mod] of Object.entries(modules)) {
  const match = FILE_PATTERN.exec(file);
  if (match && mod.messages) table.set(`${match[1]}/${match[2]}`, mod.messages);
}

/** The message for a key: chosen language, then English, then the key itself. */
export function translate(
  ns: Namespace,
  key: string,
  language: LanguageCode,
  params?: Params,
): string {
  const text =
    table.get(`${ns.name}/${language}`)?.[key] ??
    table.get(`${ns.name}/${DEFAULT_LANGUAGE}`)?.[key];
  return text === undefined ? key : interpolate(text, params);
}

/** Every loaded dictionary of one language, for tests: namespace -> messages. */
export function loadedNamespaces(language: LanguageCode): Map<string, Messages> {
  const out = new Map<string, Messages>();
  for (const [id, messages] of table) {
    const [name, lang] = id.split('/');
    if (lang === language) out.set(name, messages);
  }
  return out;
}
