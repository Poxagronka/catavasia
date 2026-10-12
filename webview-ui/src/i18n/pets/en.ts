import { defineNamespace } from '../core.js';

/** The Owner field of the Cats menu "Pets" tab. */
export const messages = {
  owner: 'Owner',
  ownerNone: 'None',
  ownerHint: 'The pet stays closer to its owner: it follows, lounges on the desk and naps nearby.',
} as const;
export const pets = defineNamespace('pets', messages);
