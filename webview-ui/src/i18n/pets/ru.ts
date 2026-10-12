import type { Translation } from '../core.js';
import type { pets } from './en.js';

export const messages: Translation<typeof pets> = {
  owner: 'Хозяин',
  ownerNone: 'Нет',
  ownerHint:
    'Питомец чаще бывает рядом с хозяином: ходит за ним, лежит на его столе и спит поблизости.',
};
