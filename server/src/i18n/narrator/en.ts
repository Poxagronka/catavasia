import { defineNamespace } from '../core.js';

export const messages = {
  planning: 'plotting the hunt',
  exploring: 'sniffing around',
  building: 'kneading the code',
  testing: 'batting at bugs',
  reviewing: 'grooming the code',
  delivering: 'bringing you a mouse',
  skill: 'reading the cat manual',
  briefing: 'holding a cat meeting',
  delegating: 'herding cats',
  teammate: 'nosing a teammate',
  input: 'meowing for you',
  permission: 'pawing at the door',
  done: 'purring, all done',
  error: 'hissing at a bug',
} as const;

export const narrator = defineNamespace('narrator', messages);
