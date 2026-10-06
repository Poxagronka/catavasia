/**
 * The Intro's step model: which steps the tour has, in what order, and which
 * piece of furniture the greeter walks to on each one. Pure data (no React),
 * so the order and the walk targets are unit-tested without a DOM.
 *
 * A step that names furniture kinds sends the greeter to the FIRST kind the
 * office has (furnitureKind, never coordinates: a customized office moves and
 * removes things). An office without any of them keeps the greeter where it
 * stands, with the same text — the tour never depends on the layout.
 */

import { CAT_CEO_CHAIR, CAT_LEAD_CHAIR } from '../constants.js';

export type IntroStepId = 'welcome' | 'engines' | 'consent' | 'ceo' | 'lead' | 'office' | 'closing';

export interface IntroStep {
  id: IntroStepId;
  /** Furniture kinds to walk to, in order of preference. Empty: stay. */
  visit: readonly string[];
}

export const INTRO_STEPS: readonly IntroStep[] = [
  { id: 'welcome', visit: [] },
  { id: 'engines', visit: [] },
  // The consent step gates the hooks install; it stays where it is.
  { id: 'consent', visit: [] },
  { id: 'ceo', visit: ['EXECUTIVE_DESK', CAT_CEO_CHAIR] },
  { id: 'lead', visit: ['LEAD_DESK', CAT_LEAD_CHAIR] },
  { id: 'office', visit: ['SCRATCHING_POST', 'CAT_TREE', 'YARN_BALL', 'SOFA', 'COFFEE'] },
  { id: 'closing', visit: [] },
];

export const INTRO_STEP_COUNT = INTRO_STEPS.length;
export const CONSENT_STEP = INTRO_STEPS.findIndex((s) => s.id === 'consent');
export const CLOSING_STEP = INTRO_STEPS.findIndex((s) => s.id === 'closing');

/** Where a consent answer leads: the step right after the ask. */
export const AFTER_CONSENT_STEP = CONSENT_STEP + 1;

/** Install commands the engines step shows, one per engine. */
export const CODEX_INSTALL_COMMAND = 'npm install -g @openai/codex';

/** Where the closing step sends bug reports and ideas. */
export const ISSUES_URL = 'https://github.com/Poxagronka/catavasia/issues';

/** The title of each Intro step. The consent title is the server's headline. */
export function introStepTitle(id: IntroStepId, headline: string, installFailed: boolean): string {
  switch (id) {
    case 'welcome':
      return 'Welcome to catavasia!';
    case 'engines':
      return 'Claude Code and Codex';
    case 'consent':
      return headline;
    case 'ceo':
      return 'The Cat CEO';
    case 'lead':
      return 'The team lead and the Cats menu';
    case 'office':
      return 'Your office';
    case 'closing':
      return installFailed ? "Hooks couldn't be installed" : "You're all set!";
  }
}
