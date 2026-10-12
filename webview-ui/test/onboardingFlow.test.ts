import { describe, expect, it } from 'vitest';

import { EXPLAIN_STEP_IDS } from '../src/onboarding/constants.js';
import {
  FLOW_CONSENT_ONLY,
  FLOW_FULL,
  type FlowEvent,
  type FlowState,
  reduceFlow,
} from '../src/onboarding/onboardingFlow.js';

const run = (start: FlowState, ...events: FlowEvent[]) => events.reduce(reduceFlow, start);
const next = (hasConsent: boolean): FlowEvent => ({ kind: 'next', hasConsent });

describe('onboarding flow', () => {
  it('walks language, every explain step, build, then done when there is no consent ask', () => {
    let s = run(FLOW_FULL, next(false));
    expect(s).toMatchObject({ phase: 'explain', explain: 0 });
    for (let i = 1; i < EXPLAIN_STEP_IDS.length; i++) s = run(s, next(false));
    expect(s).toMatchObject({ phase: 'explain', explain: EXPLAIN_STEP_IDS.length - 1 });
    s = run(s, next(false));
    expect(s.phase).toBe('build');
    expect(run(s, next(false)).phase).toBe('done');
  });

  it('asks for consent after the cats when the server has an ask', () => {
    const build: FlowState = { phase: 'build', explain: 0, skipped: false, consentOnly: false };
    const s = run(build, next(true));
    expect(s.phase).toBe('consent');
    expect(run(s, next(false)).phase).toBe('done');
  });

  it('goes back through the explain steps to the language and from build to the last explain step', () => {
    const second = run(FLOW_FULL, next(false), next(false));
    expect(run(second, { kind: 'back' })).toMatchObject({ phase: 'explain', explain: 0 });
    expect(run(second, { kind: 'back' }, { kind: 'back' }).phase).toBe('language');
    const build: FlowState = { phase: 'build', explain: 0, skipped: false, consentOnly: false };
    expect(run(build, { kind: 'back' })).toMatchObject({
      phase: 'explain',
      explain: EXPLAIN_STEP_IDS.length - 1,
    });
  });

  it('skips to the template picker from the main part, and Back from consent returns there', () => {
    for (const phase of ['language', 'explain', 'build'] as const) {
      const s = run({ phase, explain: 0, skipped: false, consentOnly: false }, { kind: 'skip' });
      expect(s).toMatchObject({ phase: 'template', skipped: true });
    }
    const picked = run(FLOW_FULL, { kind: 'skip' }, next(true));
    expect(picked.phase).toBe('consent');
    expect(run(picked, { kind: 'back' }).phase).toBe('template');
    expect(run(FLOW_FULL, { kind: 'skip' }, next(false)).phase).toBe('done');
  });

  it('does not skip the consent ask or the last step', () => {
    expect(run(FLOW_CONSENT_ONLY, { kind: 'skip' }).phase).toBe('consent');
    const done: FlowState = { phase: 'done', explain: 0, skipped: false, consentOnly: false };
    expect(run(done, { kind: 'skip' }, next(false))).toEqual(done);
  });

  it('goes back from the last step to the ask to revise the answer, but never before a consent-only ask', () => {
    const done: FlowState = { phase: 'done', explain: 0, skipped: false, consentOnly: true };
    const revised = run(done, { kind: 'back' });
    expect(revised.phase).toBe('consent');
    expect(run(revised, { kind: 'back' }).phase).toBe('consent');
    expect(run({ ...revised, consentOnly: false }, { kind: 'back' }).phase).toBe('build');
  });

  it('leaves the consent step when the ask goes away, and only then', () => {
    expect(run(FLOW_CONSENT_ONLY, { kind: 'consentGone' }).phase).toBe('done');
    expect(run(FLOW_FULL, { kind: 'consentGone' })).toEqual(FLOW_FULL);
  });
});
