/**
 * The `language` and `onboardingDone` settings, shared by the standalone server and the VS Code adapter.
 *
 * `onboardingDone` is tri-state in config.json: null = undecided. An existing user (cats.json already on disk)
 * is settled to true once (a fresh machine to false), BEFORE the CatStore can seed that file. "Reset everything" writes false, so the
 * onboarding shows again even though the reset re-creates cats.json.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { StateAdapter } from '../../core/src/adapter.js';
import { isLanguageCode, LANGUAGE_UNSET } from '../../core/src/languages.js';
import { readConfig, writeConfig } from './configPersistence.js';
import { CATS_FILE_NAME, LAYOUT_FILE_DIR, LAYOUT_FILE_NAME } from './constants.js';

export const KEY_LANGUAGE = 'pixel-agents.language';
const KEY_LAST_SEEN_VERSION = 'pixel-agents.lastSeenVersion';
export const KEY_ONBOARDING_DONE = 'pixel-agents.onboardingDone';

/** The stored UI language code, or '' when the user never chose one. */
export function getLanguage(adapter: StateAdapter | undefined): string {
  const value = adapter?.getSetting<string>(KEY_LANGUAGE, LANGUAGE_UNSET);
  return isLanguageCode(value) ? value : LANGUAGE_UNSET;
}

/** Persist a language code. An unknown code is ignored. Returns whether it was stored. */
export function setLanguage(adapter: StateAdapter | undefined, value: unknown): boolean {
  if (!adapter || !isLanguageCode(value)) return false;
  adapter.setSetting(KEY_LANGUAGE, value);
  return true;
}

/** Whether the onboarding is over. Undecided (null) counts as not done. */
export function isOnboardingDone(adapter: StateAdapter | undefined): boolean {
  return adapter?.getSetting<boolean | null>(KEY_ONBOARDING_DONE, null) === true;
}

/**
 * Settle an undecided onboarding state: an existing user (cats.json, layout.json or a seen version) is done. Call before anything
 * can create cats.json. A decided state (true or false) is never touched.
 */
export function settleOnboardingState(adapter: StateAdapter | undefined): void {
  if (!adapter) return;
  if (adapter.getSetting<boolean | null>(KEY_ONBOARDING_DONE, null) !== null) return;
  const dir = path.join(os.homedir(), LAYOUT_FILE_DIR);
  // VS Code has no cat office, so it never writes cats.json: a saved layout or a seen version also marks an existing user.
  const existing =
    fs.existsSync(path.join(dir, CATS_FILE_NAME)) ||
    fs.existsSync(path.join(dir, LAYOUT_FILE_NAME)) ||
    Boolean(adapter.getSetting<string>(KEY_LAST_SEEN_VERSION, ''));
  // Persist both outcomes now: once the CatStore seeds cats.json, a later start would read it as an existing user.
  adapter.setSetting(KEY_ONBOARDING_DONE, existing);
}

/** "Reset everything": the next connect shows the onboarding again. Both namespaces, the user's choice is machine-wide. */
export function resetOnboardingState(): void {
  const cfg = readConfig();
  cfg.vscode.onboardingDone = false;
  cfg.standalone.onboardingDone = false;
  writeConfig(cfg);
}
