/**
 * Permission modes of cats and the Cat CEO, shared by the server (engine
 * flags) and the webview (the pickers). The wire type is `PermissionMode`
 * (asyncapi.yaml). docs/catavasia/ROADMAP.md, "Permission modes".
 */

import type { CatEngine, PermissionMode } from './messages.js';

export const PERMISSION_MODES: readonly PermissionMode[] = ['auto', 'ask', 'bypass', 'readOnly'];

/** Every cat and the CEO start in Auto (owner decision 2026-10-07). */
export const DEFAULT_PERMISSION_MODE: PermissionMode = 'auto';

export const PERMISSION_MODE_LABELS: Record<PermissionMode, string> = {
  auto: 'Auto',
  ask: 'Ask before actions',
  bypass: 'Bypass',
  readOnly: 'Read only',
};

/** One plain line per mode, per engine (Codex cannot ask a person in a background run). */
const HINTS: Record<CatEngine, Record<PermissionMode, string>> = {
  claude: {
    auto: 'Claude checks each action itself and asks you only when it is not sure.',
    ask: 'Asks you in the CEO chat before it changes files or runs commands.',
    bypass: 'Does everything without asking. Use it only for work you trust.',
    readOnly: 'Can look at files and the web, but cannot change anything or run commands.',
  },
  codex: {
    auto: "Works in the project folder. Codex's own reviewer allows or refuses anything more.",
    ask: 'Codex cannot ask you: it works only in the project folder, anything more is refused.',
    bypass:
      'Does everything without asking and without a safe box. Use it only for work you trust.',
    readOnly: 'Can look at files, but cannot change anything.',
  },
};

/** Said under the picker when Auto runs as Bypass on this model. */
export const AUTO_FALLBACK_HINT = 'This model has no Auto mode, so it runs as Bypass (no asking).';

/**
 * Whether Claude Code runs Auto mode on this model. Probe of the installed
 * CLI 2.1.292 (`supportedModels()`): every model has `supportsAutoMode`
 * except Haiku; the docs name Opus 4.6+, Sonnet 4.6+ and Fable.
 */
export function autoSupported(model: string): boolean {
  return !/haiku|claude-3|claude-(opus|sonnet)-4(-[0-5])?(-\d{8})?$/.test(model);
}

/** The mode a turn really runs in: Auto on a model without it falls back to Bypass. */
export function effectiveMode(
  engine: CatEngine,
  model: string,
  mode: PermissionMode | undefined,
): PermissionMode {
  const picked = mode ?? DEFAULT_PERMISSION_MODE;
  return engine === 'claude' && picked === 'auto' && !autoSupported(model) ? 'bypass' : picked;
}

/** What a mode does on this engine, in one plain line. */
export function modeHint(engine: CatEngine, mode: PermissionMode): string {
  return HINTS[engine][mode];
}

/** The picker's line under the select. */
export function permissionHint(engine: CatEngine, model: string, mode: PermissionMode): string {
  return effectiveMode(engine, model, mode) !== mode ? AUTO_FALLBACK_HINT : modeHint(engine, mode);
}
