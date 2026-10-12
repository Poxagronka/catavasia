import { defineNamespace } from '../core.js';

/**
 * The help chat panel (title, placeholder, close button).
 * Owned by the help chat agent. Add keys here, then add them to every other language file.
 */
export const messages = {
  title: 'Help',
  placeholder: 'The help chat is coming soon.',
  close: 'Close',
} as const;

export const helpChat = defineNamespace('helpChat', messages);
