import { defineNamespace } from '../core.js';

/**
 * Onboarding screens (language pick, how-it-works, cat creation, skip templates).
 * Owned by the onboarding agent. Add keys here, then add them to every other language file.
 */
export const messages = {
  title: 'Welcome to Catavasia',
} as const;

export const onboarding = defineNamespace('onboarding', messages);
