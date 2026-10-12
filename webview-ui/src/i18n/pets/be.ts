import type { Translation } from '../core.js';
import type { pets } from './en.js';

export const messages: Translation<typeof pets> = {
  owner: 'Гаспадар',
  ownerNone: 'Няма',
  ownerHint:
    'Хатні жывёлы часцей бываюць побач з гаспадаром: ходзяць за ім, ляжаць на яго стале і спяць паблізу.',
};
