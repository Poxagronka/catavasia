import type { Translation } from '../core.js';
import type { pets } from './en.js';

export const messages: Translation<typeof pets> = {
  owner: 'Господар',
  ownerNone: 'Немає',
  ownerHint:
    'Улюбленець частіше буває поруч із господарем: ходить за ним, лежить на його столі й спить поруч.',
};
