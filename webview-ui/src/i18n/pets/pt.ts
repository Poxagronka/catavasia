import type { Translation } from '../core.js';
import type { pets } from './en.js';

export const messages: Translation<typeof pets> = {
  owner: 'Dono',
  ownerNone: 'Nenhum',
  ownerHint:
    'O bichinho fica mais perto do dono: segue o dono, deita na mesa dele e dorme por perto.',
};
