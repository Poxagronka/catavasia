/** Onboarding cats take the closest offered model and effort instead of failing validation. */

import { describe, expect, it } from 'vitest';

import { closestEffort, closestModel } from '../src/onboarding/closestOffered.js';

const options = (models: string[], efforts: string[]) => ({ models, efforts });

describe('closestModel', () => {
  it('keeps an offered model', () => {
    expect(closestModel('opus', options(['sonnet', 'opus'], []))).toBe('opus');
  });

  it('takes an offered full name that names the wanted family', () => {
    expect(closestModel('opus', options(['sonnet', 'claude-opus-4-5'], []))).toBe(
      'claude-opus-4-5',
    );
  });

  it('falls back to the first offered model, or keeps the wish when none is offered', () => {
    expect(closestModel('opus', options(['gpt-5.5', 'gpt-5.4'], []))).toBe('gpt-5.5');
    expect(closestModel('opus', options([], []))).toBe('opus');
  });
});

describe('closestEffort', () => {
  it('keeps an offered effort', () => {
    expect(closestEffort('medium', options([], ['low', 'medium']))).toBe('medium');
  });

  it('takes the nearest level on the scale', () => {
    expect(closestEffort('medium', options([], ['low', 'high', 'xhigh']))).toBe('low');
    expect(closestEffort('medium', options([], ['high', 'max']))).toBe('high');
  });

  it('falls back to the first offered level, or keeps the wish when none is offered', () => {
    expect(closestEffort('medium', options([], ['turbo']))).toBe('turbo');
    expect(closestEffort('medium', options([], []))).toBe('medium');
  });
});
