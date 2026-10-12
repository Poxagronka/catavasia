// Is an engine CLI ready for a task: installed and logged in, as the
// server's last probe saw it (server/src/orchestrator/engineStatus.ts).
// Pure: the notice, the task form and the onboarding step all read it.

import { ENGINE_INSTALL_COMMANDS, ENGINE_LOGIN_COMMANDS } from '../../../core/src/constants.js';
import { type Engine, ENGINE_LABELS, type EngineOptions } from '../cats/catsApi.js';
import type { MessageKey, Params } from '../i18n/core.js';
import { translate } from '../i18n/dictionaries.js';
import { getLanguage } from '../i18n/languageStore.js';
import { terminal } from '../i18n/terminal/en.js';

const tr = (key: MessageKey<typeof terminal>, params?: Params): string =>
  translate(terminal, key, getLanguage(), params);

export interface EngineProblem {
  engine: Engine;
  kind: 'notInstalled' | 'notLoggedIn';
  /** Shown when the CLI is not installed. */
  installCommand?: string;
  /** The CLI is installed but logged out: the Log in button helps. */
  needsLogin: boolean;
  /** The command the Log in button runs (and what to type in a terminal without it). */
  loginCommand: string;
}

/** The problem as one sentence in the UI language: "Claude Code is not logged in". */
export function engineReason(problem: EngineProblem): string {
  return tr(
    problem.kind === 'notInstalled' ? 'engineReasonNotInstalled' : 'engineReasonNotLoggedIn',
    { engine: ENGINE_LABELS[problem.engine] },
  );
}

/** What is wrong with this engine, or null when it is ready (or not probed yet). */
export function engineProblem(engine: Engine, options: EngineOptions): EngineProblem | null {
  const status = options.status;
  if (!status) return null;
  const loginCommand = ENGINE_LOGIN_COMMANDS[engine].join(' ');
  if (!status.installed) {
    return {
      engine,
      kind: 'notInstalled',
      installCommand: ENGINE_INSTALL_COMMANDS[engine],
      needsLogin: false,
      loginCommand,
    };
  }
  if (status.loggedIn === false) {
    return { engine, kind: 'notLoggedIn', needsLogin: true, loginCommand };
  }
  return null;
}

/** One status line for the onboarding step and the notice: "installed 2.1.291, logged in". */
export function engineStatusLine(options: EngineOptions): string | null {
  const status = options.status;
  if (!status) return null;
  if (!status.installed) return tr('engineStatusNotInstalled');
  const installed = tr('engineStatusInstalled', { version: status.version ?? '' }).trim();
  if (status.loggedIn === undefined) return installed;
  const login = tr(status.loggedIn ? 'engineStatusLoggedIn' : 'engineStatusNotLoggedIn');
  return tr('engineStatusJoin', { a: installed, b: login });
}

/** Engines a task can need: Claude Code always (plain runs), plus every cat's engine. */
export function neededEngines(cats: ReadonlyArray<{ engine: Engine }>): Engine[] {
  const engines = new Set<Engine>(['claude']);
  for (const cat of cats) engines.add(cat.engine);
  return [...engines];
}
