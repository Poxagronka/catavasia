import type { Translation } from '../core.js';
import type { pets } from './en.js';

export const messages: Translation<typeof pets> = {
  owner: 'Sahip',
  ownerNone: 'Yok',
  ownerHint:
    'Evcil hayvan sahibine daha yakın durur: onu takip eder, masasında uzanır ve yakınında uyur.',
};
