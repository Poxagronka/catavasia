import { defineNamespace } from '../core.js';

/** The help chat panel: title, input, buttons and the first guide message. */
export const messages = {
  title: 'Help',
  placeholder: 'Ask anything about Catavasia, or ask for help with a cat prompt.',
  close: 'Close',
  send: 'Send',
  stop: 'Stop',
  thinking: 'Thinking…',
  newChat: 'New chat',
  greetingOnboarding:
    'Hi! I am your Catavasia guide. Ask me how things work, or ask me to help you write a prompt for your cat.',
  greetingSettings:
    'Hi! I am your Catavasia guide. Ask me anything about the app, or ask me to help you write a cat prompt.',
} as const;

export const helpChat = defineNamespace('helpChat', messages);
