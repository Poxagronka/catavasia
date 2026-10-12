/**
 * The onboarding's step model as a pure reducer: no React, so the order and the skip rules are unit-tested.
 *
 * Full flow:    language → explain (6 steps) → build cats → [consent] → done
 * Skip:         template picker → [consent] → done
 * Consent only: consent → done (an old user with a hooks ask still pending)
 * Back from the last step returns to the consent ask, to revise the answer (the done step offers it only then).
 * The consent step exists only while the server has an ask for the user.
 */

import { EXPLAIN_STEP_IDS } from './constants.js';

export type Phase = 'language' | 'explain' | 'build' | 'template' | 'consent' | 'done';

export interface FlowState {
  phase: Phase;
  /** Index into EXPLAIN_STEP_IDS while phase is 'explain'. */
  explain: number;
  /** The user skipped to the template picker: Back from consent returns there. */
  skipped: boolean;
  /** The flow starts at the consent ask (an old user): nothing comes before it. */
  consentOnly: boolean;
}

export type FlowEvent =
  | { kind: 'next'; hasConsent: boolean }
  | { kind: 'back' }
  | { kind: 'skip' }
  /** The consent ask vanished (answered elsewhere): leave the consent step. */
  | { kind: 'consentGone' };

export const FLOW_FULL: FlowState = {
  phase: 'language',
  explain: 0,
  skipped: false,
  consentOnly: false,
};
export const FLOW_CONSENT_ONLY: FlowState = {
  phase: 'consent',
  explain: 0,
  skipped: false,
  consentOnly: true,
};

const LAST_EXPLAIN = EXPLAIN_STEP_IDS.length - 1;

/** The phase after the cat step (build or template): the consent ask when there is one, else the end. */
function afterCats(state: FlowState, hasConsent: boolean): FlowState {
  return { ...state, phase: hasConsent ? 'consent' : 'done' };
}

function forward(state: FlowState, hasConsent: boolean): FlowState {
  switch (state.phase) {
    case 'language':
      return { ...state, phase: 'explain', explain: 0 };
    case 'explain':
      return state.explain < LAST_EXPLAIN
        ? { ...state, explain: state.explain + 1 }
        : { ...state, phase: 'build' };
    case 'build':
    case 'template':
      return afterCats(state, hasConsent);
    case 'consent':
      return { ...state, phase: 'done' };
    case 'done':
      return state;
  }
}

function backward(state: FlowState): FlowState {
  switch (state.phase) {
    case 'explain':
      return state.explain > 0
        ? { ...state, explain: state.explain - 1 }
        : { ...state, phase: 'language' };
    case 'build':
      return { ...state, phase: 'explain', explain: LAST_EXPLAIN };
    case 'template':
      return { ...state, phase: 'language', skipped: false };
    case 'consent':
      if (state.consentOnly) return state;
      return { ...state, phase: state.skipped ? 'template' : 'build' };
    case 'done':
      // Back to the ask for a change of mind: the server treats a revised answer as the absolute one.
      return { ...state, phase: 'consent' };
    default:
      return state;
  }
}

export function reduceFlow(state: FlowState, event: FlowEvent): FlowState {
  switch (event.kind) {
    case 'next':
      return forward(state, event.hasConsent);
    case 'back':
      return backward(state);
    case 'skip':
      // Skip is for the main part only: the consent ask and the last step stay.
      if (state.phase === 'consent' || state.phase === 'done' || state.phase === 'template') {
        return state;
      }
      return { ...state, phase: 'template', skipped: true };
    case 'consentGone':
      return state.phase === 'consent' ? { ...state, phase: 'done' } : state;
  }
}
