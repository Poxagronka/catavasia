import { defineNamespace } from '../core.js';

/** Strings shared by many screens. */
export const messages = {
  settings: 'Settings',
  language: 'Language',
  runOnboardingAgain: 'Run onboarding again',
} as const;

export const common = defineNamespace('common', messages);
