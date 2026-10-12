import type { Translation } from '../core.js';
import type { pets } from './en.js';

export const messages: Translation<typeof pets> = {
  owner: 'المالك',
  ownerNone: 'لا أحد',
  ownerHint: 'يبقى الحيوان الأليف قريبًا من مالكه أكثر: يتبعه ويستلقي على مكتبه وينام بالقرب منه.',
};
