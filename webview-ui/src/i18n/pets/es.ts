import type { Translation } from '../core.js';
import type { pets } from './en.js';

export const messages: Translation<typeof pets> = {
  owner: 'Dueño',
  ownerNone: 'Ninguno',
  ownerHint:
    'La mascota está más cerca de su dueño: lo sigue, se tumba en su escritorio y duerme cerca.',
};
