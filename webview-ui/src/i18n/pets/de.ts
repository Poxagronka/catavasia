import type { Translation } from '../core.js';
import type { pets } from './en.js';

export const messages: Translation<typeof pets> = {
  owner: 'Besitzer',
  ownerNone: 'Keiner',
  ownerHint:
    'Das Haustier bleibt öfter beim Besitzer: Es folgt ihm, liegt auf seinem Schreibtisch und schläft in der Nähe.',
};
