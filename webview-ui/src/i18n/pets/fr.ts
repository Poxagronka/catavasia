import type { Translation } from '../core.js';
import type { pets } from './en.js';

export const messages: Translation<typeof pets> = {
  owner: 'Maître',
  ownerNone: 'Aucun',
  ownerHint:
    'Le familier reste plus près de son maître : il le suit, se couche sur son bureau et dort à côté.',
};
