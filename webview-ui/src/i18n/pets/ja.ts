import type { Translation } from '../core.js';
import type { pets } from './en.js';

export const messages: Translation<typeof pets> = {
  owner: '飼い主',
  ownerNone: 'なし',
  ownerHint:
    'ペットは飼い主のそばにいる時間が増えます。後をついて歩き、机の上でくつろぎ、近くで昼寝します。',
};
