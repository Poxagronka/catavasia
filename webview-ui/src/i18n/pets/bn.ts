import type { Translation } from '../core.js';
import type { pets } from './en.js';

export const messages: Translation<typeof pets> = {
  owner: 'মালিক',
  ownerNone: 'কেউ নয়',
  ownerHint:
    'পোষা প্রাণী মালিকের কাছে বেশি থাকে: তার পিছনে চলে, তার ডেস্কে বিশ্রাম নেয় এবং কাছেই ঘুমায়।',
};
